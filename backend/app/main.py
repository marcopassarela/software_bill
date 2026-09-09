import re
import hashlib
import os
import secrets
import smtplib

from datetime import datetime, date, timedelta, timezone
from email.message import EmailMessage
from typing import Any

from fastapi import Depends, FastAPI, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, select, update, delete
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from .config import get_settings
from .database import Base, engine, get_db
from .models import *
from .security import (
    audit,
    current_user,
    hash_password,
    require,
    token_for,
    verify_password,
    MODULES,
    apply_auto_unblock,
    block_detail,
    clear_block,
)


# ============================================================
# APP
# ============================================================

app = FastAPI(
    title="Gestão Logística API",
    version="1.0.0",
)

settings = get_settings()

limiter = Limiter(
    key_func=get_remote_address
)

app.state.limiter = limiter


@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return Response(
        '{"detail":"Muitas tentativas nesta rede. Aguarde 1 minuto e tente novamente."}',
        status_code=429,
        headers={"Retry-After": "60"},
        media_type="application/json",
    )


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# PLANOS
# ============================================================

PLAN_LIMITS = {
    "essencial": {
        "name": "Plano Essencial",
        "price": 39.90,
        "users": 1,
    },
    "profissional": {
        "name": "Plano Profissional",
        "price": 69.90,
        "users": 3,
    },
    "empresarial": {
        "name": "Plano Empresarial",
        "price": 119.90,
        "users": 6,
    },
}


def get_current_company(
    user: User,
    db: Session,
) -> Company:
    """
    Retorna a empresa do usuário autenticado.

    IMPORTANTE:
    company_id nunca vem do frontend.
    O tenant é determinado exclusivamente pelo usuário autenticado.
    """

    company_id = getattr(user, "company_id", None)

    if not company_id:
        raise HTTPException(
            status_code=403,
            detail="Usuário não está vinculado a uma empresa.",
        )

    company = db.scalar(
        select(Company).where(
            Company.id == company_id
        )
    )

    if not company:
        raise HTTPException(
            status_code=403,
            detail="Empresa não encontrada.",
        )

    if not company.active:
        raise HTTPException(
            status_code=403,
            detail="Empresa inativa.",
        )

    return company


def get_company_plan(
    company: Company,
) -> dict:
    plan_key = (
        getattr(company, "plan", None)
        or "essencial"
    ).strip().lower()

    return PLAN_LIMITS.get(
        plan_key,
        PLAN_LIMITS["essencial"],
    )


def ensure_same_company(
    obj,
    company: Company,
):
    if not obj:
        raise HTTPException(
            404,
            "Registro não encontrado",
        )

    if getattr(obj, "company_id", None) != company.id:
        raise HTTPException(
            404,
            "Registro não encontrado",
        )

    return obj


def company_condition(
    model,
    company: Company,
):
    if not hasattr(model, "company_id"):
        raise HTTPException(
            500,
            f"Modelo {model.__name__} não possui company_id.",
        )

    return model.company_id == company.id

def normalize_cpf(value: Any) -> str | None:
    if value is None:
        return None

    digits = "".join(c for c in str(value) if c.isdigit())

    if not digits:
        return None

    if len(digits) != 11:
        raise HTTPException(
            status_code=422,
            detail="CPF deve conter 11 dígitos.",
        )

    return digits


# ============================================================
# ERROS
# ============================================================

@app.exception_handler(Exception)
async def unhandled_exception_handler(
    request: Request,
    exc: Exception,
):
    return JSONResponse(
        status_code=500,
        content={
            "detail": f"Erro interno: {exc}"
        },
    )


# ============================================================
# MANUTENÇÃO
# ============================================================

def update_maintenance_status(
    db: Session,
):
    """
    Atualiza manutenções agendadas cuja data já chegou.
    """

    today = date.today()

    db.execute(
        update(Maintenance)
        .where(
            Maintenance.status == "Agendado",
            func.date(Maintenance.date) <= today,
        )
        .values(
            status="Em andamento"
        )
    )

    db.commit()


# ============================================================
# STARTUP
# ============================================================

@app.on_event("startup")
def seed():
    Base.metadata.create_all(engine)

    with Session(engine) as db:
        update_maintenance_status(db)


# ============================================================
# SCHEMAS
# ============================================================

class Login(BaseModel):
    username: str
    password: str
    latitude: float | None = None
    longitude: float | None = None


class PasswordChange(BaseModel):
    current_password: str = Field(
        min_length=1,
        max_length=200,
    )

    new_password: str = Field(
        min_length=3,
        max_length=200,
    )


class ProfileUpdate(BaseModel):
    name: str = Field(
        min_length=1,
        max_length=120,
    )

    email: str | None = Field(
        default=None,
        max_length=160,
    )


class UserCreate(BaseModel):
    name: str
    username: str
    email: str = Field(
        min_length=5,
        max_length=160,
    )
    password: str = Field(
        min_length=1,
    )
    role: Role
    permissions: str | None = None


class Payload(BaseModel):
    data: dict[str, Any]


# ============================================================
# PRODUÇÃO / ESTOQUE
# ============================================================

class Movement(BaseModel):
    product_id: int
    quantity: float = Field(gt=0)
    responsible: str | None = None
    recipient: str | None = None
    sector: str | None = None
    vehicle_id: int | None = None
    observation: str | None = None
    invoice: str | None = None
    unit_value: float | None = None


class MovementEdit(BaseModel):
    password: str
    quantity: float | None = None
    responsible: str | None = None
    recipient: str | None = None
    sector: str | None = None
    vehicle_id: int | None = None
    observation: str | None = None
    invoice: str | None = None
    unit_value: float | None = None


class MovementDelete(BaseModel):
    password: str


# ============================================================
# USUÁRIO
# ============================================================

def user_is_blocked(
    u: User,
    db: Session,
) -> bool:

    if not u.active:

        if (
            u.block_type == "scheduled"
            and u.blocked_until
        ):
            now = datetime.now(timezone.utc)

            until = u.blocked_until

            if until.tzinfo is None:
                until = until.replace(
                    tzinfo=timezone.utc
                )

            if now >= until:
                clear_block(u)
                db.commit()
                return False

        return True

    return False


# ============================================================
# SERIALIZAÇÃO
# ============================================================

def serialize(o):

    if o is None:
        return None

    d = {
        c.name: getattr(o, c.name)
        for c in o.__table__.columns
    }

    return {
        k: (
            v.value
            if hasattr(v, "value")
            else v.isoformat()
            if isinstance(v, (datetime, date))
            else float(v)
            if hasattr(v, "as_tuple")
            else v
        )
        for k, v in d.items()
    }


def serialize_user(
    o: User,
    company: Company | None = None,
):

    d = serialize(o)

    d.pop(
        "password_hash",
        None,
    )

    d["is_main_admin"] = bool(
        o.role == Role.ADMIN
        and getattr(o, "is_owner", False)
    )

    d["has_avatar"] = bool(
        getattr(o, "avatar_data", None)
    )

    if company:

        plan_key = (
            getattr(company, "plan", None)
            or "essencial"
        ).strip().lower()

        plan = PLAN_LIMITS.get(
            plan_key,
            PLAN_LIMITS["essencial"],
        )

        d["plan"] = (
            plan_key
            if plan_key in PLAN_LIMITS
            else "essencial"
        )

        d["plan_name"] = plan["name"]
        d["plan_price"] = plan["price"]
        d["plan_user_limit"] = plan["users"]

        d["company_id"] = company.id
        d["company_name"] = company.name

    return d


def model_data(
    model,
    data,
):

    ignored = {
        "id",
        "quantity",
        "created_at",
        "occurred_at",
        "company_id",
    }

    return {
        c.name: v
        for c in model.__table__.columns
        for k, v in data.items()
        if k == c.name
        and k not in ignored
    }


def normalize_company_document(
    value: Any,
) -> str | None:
    if value is None:
        return None

    digits = "".join(
        c for c in str(value)
        if c.isdigit()
    )

    if not digits:
        return None

    if len(digits) == 11:
        return digits

    if len(digits) == 14:
        return digits

    raise HTTPException(
        status_code=422,
        detail="Informe um CPF com 11 dígitos ou um CNPJ com 14 dígitos.",
    )


# ============================================================
# HEALTH
# ============================================================

@app.get("/health")
def health():
    return {
        "status": "ok"
    }


class RegisterCompanyBody(BaseModel):
    plan: str = "essencial"
    company_name: str = Field(min_length=1, max_length=160)
    company_document: str | None = None
    company_phone: str | None = None
    admin_name: str = Field(min_length=1, max_length=120)
    admin_username: str = Field(min_length=1, max_length=60)
    admin_email: str = Field(min_length=5, max_length=160)
    admin_password: str = Field(min_length=6, max_length=200)


def normalize_company_document(
    value: Any,
) -> str | None:
    if value is None:
        return None

    digits = "".join(
        c for c in str(value)
        if c.isdigit()
    )

    if not digits:
        return None

    if len(digits) not in (11, 14):
        raise HTTPException(
            status_code=422,
            detail=(
                "Informe um CPF com 11 dígitos "
                "ou um CNPJ com 14 dígitos."
            ),
        )

    return digits

@app.post("/auth/register-company")
@limiter.limit("5/minute")
def register_company(
    body: RegisterCompanyBody,
    request: Request,
    db: Session = Depends(get_db),
):
    company_document = normalize_company_document(
        body.company_document
    )

    if not company_document:
        raise HTTPException(
            status_code=422,
            detail="CPF ou CNPJ da empresa é obrigatório.",
        )

    duplicate_document = db.scalar(
        select(Company).where(
            Company.document == company_document
        )
    )

    if duplicate_document:
        document_type = (
            "CPF"
            if len(company_document) == 11
            else "CNPJ"
        )

        raise HTTPException(
            status_code=409,
            detail=(
                f"Este {document_type} já está cadastrado "
                "em uma empresa."
            ),
        )
    
    def normalize_company_document(value: Any) -> str | None:
        if value is None:
            return None

        digits = "".join(
            c for c in str(value)
            if c.isdigit()
        )

        if not digits:
            return None

        if len(digits) not in (11, 14):
            raise HTTPException(
                status_code=422,
                detail=(
                    "Informe um CPF com 11 dígitos "
                    "ou um CNPJ com 14 dígitos."
                ),
            )

        return digits

    # ---------------------------------------------------------
    # CPF/CNPJ da empresa
    # ---------------------------------------------------------
    company_document = normalize_company_document(
        body.company_document
    )

    if not company_document:
        raise HTTPException(
            status_code=422,
            detail="CPF ou CNPJ da empresa é obrigatório.",
        )

    # Verifica se o CPF/CNPJ já pertence a uma empresa
    existing_company = db.scalar(
        select(Company).where(
            Company.document == company_document
        )
    )

    if existing_company:
        document_type = (
            "CPF"
            if len(company_document) == 11
            else "CNPJ"
        )

        raise HTTPException(
            status_code=409,
            detail=(
                f"Este {document_type} já está cadastrado "
                "em uma empresa."
            ),
        )

    # ---------------------------------------------------------
    # Plano
    # ---------------------------------------------------------
    plan_key = (
        body.plan or "essencial"
    ).strip().lower()

    if plan_key not in PLAN_LIMITS:
        plan_key = "essencial"

    # ---------------------------------------------------------
    # Usuário administrador
    # ---------------------------------------------------------
    username = body.admin_username.strip().lower()

    if not username:
        raise HTTPException(
            422,
            "Usuário é obrigatório",
        )

    email = body.admin_email.strip().lower()

    if "@" not in email:
        raise HTTPException(
            422,
            "E-mail inválido",
        )

    # O username precisa ser único no sistema
    duplicate_username = db.scalar(
        select(User).where(
            func.lower(User.username) == username
        )
    )

    if duplicate_username:
        raise HTTPException(
            409,
            "Este nome de usuário já está em uso",
        )

    # ---------------------------------------------------------
    # Cria empresa
    # ---------------------------------------------------------
    company = Company(
        name=body.company_name.strip(),
        document=company_document,
        phone=(body.company_phone or "").strip() or None,
        email=email,
        plan=plan_key,
    )

    db.add(company)

    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            409,
            "Este CPF/CNPJ já está cadastrado ou não foi possível criar a empresa.",
        ) from exc

    # ---------------------------------------------------------
    # Cria proprietário da empresa
    # ---------------------------------------------------------
    admin = User(
        company_id=company.id,
        name=body.admin_name.strip(),
        username=username,
        email=email,
        password_hash=hash_password(body.admin_password),
        role=Role.ADMIN,
        is_owner=True,
        must_change_password=False,
    )

    db.add(admin)

    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            409,
            "Nome de usuário ou e-mail já está em uso",
        ) from exc

    # ---------------------------------------------------------
    # Auditoria
    # ---------------------------------------------------------
    audit(
        db,
        admin,
        "CRIAÇÃO_DE_EMPRESA",
        "company",
        company.id,
        request,
    )

    audit(
        db,
        admin,
        "CRIAÇÃO_DE_USUÁRIO",
        "users",
        admin.id,
        request,
    )

    db.commit()

    return {
        "ok": True,
        "company": serialize(company),
        "user": serialize_user(admin, company),

        # Integração de cobrança (Asaas) ainda não conectada.
        "payment_url": None,
    }


# ============================================================
# LOGIN
# ============================================================

@app.post("/auth/login")
@limiter.limit("20/minute")
def login(
    body: Login,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):

    login_username = (
        body.username or ""
    ).strip().lower()

    u = db.scalar(
        select(User).where(
            func.lower(User.username)
            == login_username
        )
    )

    if not u:

        audit(
            db,
            None,
            "LOGIN_INVÁLIDO",
            "auth",
            request=request,
            details="Tentativa de login inválida: Usuário inexistente",
            username_attempted=login_username[:120],
            latitude=body.latitude,
            longitude=body.longitude,
        )

        db.commit()

        raise HTTPException(
            401,
            "Usuário ou senha inválidos",
        )

    locked_until = getattr(
        u,
        "login_locked_until",
        None,
    )

    if locked_until:

        if locked_until.tzinfo is None:
            locked_until = locked_until.replace(
                tzinfo=timezone.utc
            )

        now = datetime.now(
            timezone.utc
        )

        if now < locked_until:

            seconds = max(
                1,
                int(
                    (
                        locked_until
                        - now
                    ).total_seconds()
                ),
            )

            minutes = max(
                1,
                (seconds + 59) // 60,
            )

            raise HTTPException(
                429,
                "Este usuário foi temporariamente protegido após várias tentativas. "
                f"Tente novamente em aproximadamente {minutes} minuto(s).",
                headers={
                    "Retry-After": str(seconds)
                },
            )

        u.login_locked_until = None
        u.login_failures = 0

    if not verify_password(
        body.password,
        u.password_hash,
    ):

        u.login_failures = (
            int(
                getattr(
                    u,
                    "login_failures",
                    0,
                )
                or 0
            )
            + 1
        )

        if u.login_failures >= 8:

            u.login_locked_until = (
                datetime.now(timezone.utc)
                + timedelta(minutes=15)
            )

            u.login_failures = 0

        audit(
            db,
            u,
            "LOGIN_INVÁLIDO",
            "auth",
            request=request,
            details="Tentativa de login inválida: Senha inválida",
            username_attempted=login_username[:120],
            latitude=body.latitude,
            longitude=body.longitude,
        )

        db.commit()

        raise HTTPException(
            401,
            "Usuário ou senha inválidos",
        )

    still_blocked = apply_auto_unblock(u)

    if still_blocked:

        audit(
            db,
            u,
            "LOGIN_BLOQUEADO",
            "auth",
            request=request,
            details="Login recusado: conta bloqueada",
            username_attempted=u.username,
            latitude=body.latitude,
            longitude=body.longitude,
        )

        db.commit()

        raise HTTPException(
            403,
            block_detail(u),
        )

    u.login_failures = 0
    u.login_locked_until = None

    audit(
        db,
        u,
        "LOGIN",
        "auth",
        request=request,
        details="Login realizado com sucesso",
        username_attempted=u.username,
        latitude=body.latitude,
        longitude=body.longitude,
    )

    db.commit()

    company = get_current_company(
        u,
        db,
    )

    response.set_cookie(
        "gl_session",
        token_for(u),
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        max_age=settings.access_token_minutes * 60,
        path="/",
    )

    return {
        "user": serialize_user(
            u,
            company,
        )
    }


# ============================================================
# LOGOUT
# ============================================================

@app.post("/auth/logout")
def logout(
    response: Response,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):

    audit(
        db,
        user,
        "LOGOUT",
        "auth",
        request=request,
    )

    db.commit()

    response.delete_cookie(
        "gl_session",
        path="/",
    )

    return {
        "ok": True
    }


# ============================================================
# ME
# ============================================================

@app.get("/auth/me")
def me(
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):

    company = get_current_company(
        user,
        db,
    )

    return serialize_user(
        user,
        company,
    )


# ============================================================
# ALTERAR SENHA
# ============================================================

@app.post("/auth/change-password")
def change_password(
    body: PasswordChange,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):

    if not verify_password(
        body.current_password,
        user.password_hash,
    ):
        raise HTTPException(
            400,
            "Senha atual incorreta",
        )

    user.password_hash = hash_password(
        body.new_password
    )

    user.must_change_password = False

    audit(
        db,
        user,
        "ALTERAÇÃO_DE_SENHA",
        "auth",
        user.id,
        request,
    )

    db.commit()

    return {
        "ok": True
    }


# ============================================================
# PERFIL
# ============================================================

@app.patch("/auth/profile")
def update_profile(
    body: ProfileUpdate,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):

    company = get_current_company(
        user,
        db,
    )

    user.name = body.name.strip()

    if body.email is not None:

        email = (
            body.email
            .strip()
            .lower()
        )

        if not email or "@" not in email:
            raise HTTPException(
                400,
                "E-mail inválido",
            )

        other = db.scalar(
            select(User).where(
                User.email == email,
                User.id != user.id,
                User.company_id == company.id,
            )
        )

        if other:
            raise HTTPException(
                400,
                "Este e-mail já está em uso",
            )

        user.email = email

    audit(
        db,
        user,
        "ALTERAÇÃO_DE_PERFIL",
        "auth",
        user.id,
        request,
    )

    db.commit()

    return serialize_user(
        user,
        company,
    )


# ============================================================
# AVATAR
# ============================================================

class AvatarBody(BaseModel):
    avatar_data: str


@app.post("/auth/avatar")
def upload_avatar(
    body: AvatarBody,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):

    company = get_current_company(
        user,
        db,
    )

    raw = (
        body.avatar_data or ""
    ).strip()

    if not raw.startswith(
        "data:image/"
    ):
        raise HTTPException(
            400,
            "Envie uma imagem (JPEG ou PNG)",
        )

    if len(raw) > 200_000:
        raise HTTPException(
            400,
            "Imagem muito grande. Use uma foto leve (até ~150 KB).",
        )

    u = db.scalar(
        select(User).where(
            User.id == user.id,
            User.company_id == company.id,
        )
    )

    if not u:
        raise HTTPException(
            404,
            "Usuário não encontrado",
        )

    u.avatar_data = raw

    audit(
        db,
        u,
        "AVATAR",
        "auth",
        u.id,
        request,
    )

    db.commit()

    return serialize_user(
        u,
        company,
    )


@app.delete("/auth/avatar")
def delete_avatar(
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):

    company = get_current_company(
        user,
        db,
    )

    u = db.scalar(
        select(User).where(
            User.id == user.id,
            User.company_id == company.id,
        )
    )

    if not u:
        raise HTTPException(
            404,
            "Usuário não encontrado",
        )

    u.avatar_data = None

    audit(
        db,
        u,
        "AVATAR_REMOVE",
        "auth",
        u.id,
        request,
    )

    db.commit()

    return serialize_user(
        u,
        company,
    )


# ============================================================
# ADMIN DA EMPRESA
# ============================================================

def company_admin(
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):

    company = get_current_company(
        user,
        db,
    )

    if user.role != Role.ADMIN:
        raise HTTPException(
            403,
            "Apenas administradores podem executar esta ação.",
        )

    return user


@app.get("/users")
def users(
    admin: User = Depends(company_admin),
    db: Session = Depends(get_db),
):

    company = get_current_company(
        admin,
        db,
    )

    rows = db.scalars(
        select(User)
        .where(
            User.company_id == company.id
        )
        .order_by(User.name)
    ).all()

    return [
        serialize_user(
            user,
            company,
        )
        for user in rows
    ]


@app.post("/users")
def create_user(
    body: UserCreate,
    request: Request,
    admin: User = Depends(company_admin),
    db: Session = Depends(get_db),
):

    company = get_current_company(
        admin,
        db,
    )

    plan = get_company_plan(
        company
    )

    current_users = (
        db.scalar(
            select(
                func.count(User.id)
            ).where(
                User.company_id
                == company.id
            )
        )
        or 0
    )

    if current_users >= plan["users"]:

        raise HTTPException(
            409,
            f"O {plan['name']} permite no máximo "
            f"{plan['users']} usuário(s). "
            "Faça upgrade do plano para cadastrar outro usuário.",
        )

    username = (
        body.username or ""
    ).strip().lower()

    if not username:
        raise HTTPException(
            422,
            "Nome de usuário é obrigatório",
        )

    duplicate = db.scalar(
        select(User).where(
            func.lower(
                User.username
            ) == username,
            User.company_id
            == company.id,
        )
    )

    if duplicate:
        raise HTTPException(
            409,
            "Nome de usuário já está em uso nesta empresa",
        )

    email = (
        body.email or ""
    ).strip().lower()

    if "@" not in email:
        raise HTTPException(
            422,
            "E-mail inválido",
        )

    duplicate_email = db.scalar(
        select(User).where(
            func.lower(
                User.email
            ) == email,
            User.company_id
            == company.id,
        )
    )

    if duplicate_email:
        raise HTTPException(
            409,
            "Este e-mail já está em uso nesta empresa",
        )

    u = User(
        company_id=company.id,
        name=body.name.strip(),
        username=username,
        email=email,
        password_hash=hash_password(
            body.password
        ),
        role=body.role,
        permissions=body.permissions,
        must_change_password=True,
    )

    db.add(u)

    try:
        db.flush()

    except IntegrityError as exc:

        db.rollback()

        raise HTTPException(
            409,
            "Usuário já existe",
        ) from exc

    audit(
        db,
        admin,
        "CRIAÇÃO_DE_USUÁRIO",
        "users",
        u.id,
        request,
    )

    db.commit()

    return serialize_user(
        u,
        company,
    )


@app.patch("/users/{user_id}")
def update_user(
    user_id: int,
    body: Payload,
    request: Request,
    admin: User = Depends(company_admin),
    db: Session = Depends(get_db),
):

    company = get_current_company(
        admin,
        db,
    )

    u = db.scalar(
        select(User).where(
            User.id == user_id,
            User.company_id == company.id,
        )
    )

    if not u:
        raise HTTPException(
            404,
            "Usuário não encontrado",
        )

    data = dict(body.data)

    data.pop(
        "company_id",
        None,
    )

    if "email" in data and data["email"] is not None:

        data["email"] = (
            str(data["email"])
            .strip()
            .lower()
        )

        duplicate = db.scalar(
            select(User).where(
                func.lower(User.email)
                == data["email"],
                User.id != user_id,
                User.company_id == company.id,
            )
        )

        if duplicate:
            raise HTTPException(
                409,
                "Este e-mail já está em uso",
            )

    if "username" in data and data["username"] is not None:

        username = (
            str(data["username"])
            .strip()
            .lower()
        )

        duplicate = db.scalar(
            select(User).where(
                func.lower(
                    User.username
                ) == username,
                User.id != user_id,
                User.company_id == company.id,
            )
        )

        if duplicate:
            raise HTTPException(
                409,
                "Nome de usuário já está em uso",
            )

        data["username"] = username

    allowed = {
        "name",
        "username",
        "email",
        "role",
        "active",
        "permissions",
    }

    for key in allowed:

        if key in data:
            setattr(
                u,
                key,
                data[key],
            )

    if data.get("password"):

        pwd = str(
            data["password"]
        )

        if len(pwd) < 3:
            raise HTTPException(
                422,
                "A nova senha deve ter pelo menos 3 caracteres",
            )

        u.password_hash = hash_password(
            pwd
        )

        u.must_change_password = True

    try:
        db.flush()

    except IntegrityError as exc:

        db.rollback()

        raise HTTPException(
            409,
            "Nome de usuário ou e-mail já está em uso",
        ) from exc

    audit(
        db,
        admin,
        "ALTERAÇÃO_DE_USUÁRIO",
        "users",
        u.id,
        request,
    )

    db.commit()

    return serialize_user(
        u,
        company,
    )


@app.delete("/users/{user_id}")
def delete_user(
    user_id: int,
    request: Request,
    admin: User = Depends(company_admin),
    db: Session = Depends(get_db),
):

    company = get_current_company(
        admin,
        db,
    )

    u = db.scalar(
        select(User).where(
            User.id == user_id,
            User.company_id == company.id,
        )
    )

    if not u:
        raise HTTPException(
            404,
            "Usuário não encontrado",
        )

    if u.id == admin.id and getattr(
        u,
        "is_owner",
        False,
    ):
        raise HTTPException(
            400,
            "Não é possível excluir o proprietário da empresa",
        )

    db.execute(
        update(AuditLog)
        .where(
            AuditLog.user_id == user_id,
            AuditLog.company_id == company.id,
        )
        .values(
            user_id=None
        )
    )

    try:

        db.delete(u)
        db.flush()

    except IntegrityError as exc:

        db.rollback()

        raise HTTPException(
            409,
            "Não é possível excluir: este usuário possui registros vinculados. Desative-o em vez de excluir.",
        ) from exc

    audit(
        db,
        admin,
        "EXCLUSÃO_DE_USUÁRIO",
        "users",
        user_id,
        request,
    )

    db.commit()

    return {
        "ok": True
    }


# ============================================================
# BLOQUEIO DE USUÁRIO
# ============================================================

class BlockUserBody(BaseModel):
    mode: str
    blocked_until: datetime | None = None
    reason: str | None = None


@app.post("/users/{user_id}/block")
def block_user(
    user_id: int,
    body: BlockUserBody,
    request: Request,
    admin: User = Depends(company_admin),
    db: Session = Depends(get_db),
):

    company = get_current_company(
        admin,
        db,
    )

    u = db.scalar(
        select(User).where(
            User.id == user_id,
            User.company_id == company.id,
        )
    )

    if not u:
        raise HTTPException(
            404,
            "Usuário não encontrado",
        )

    if (
        u.id == admin.id
        and getattr(
            u,
            "is_owner",
            False,
        )
    ):
        raise HTTPException(
            400,
            "Não é possível bloquear o proprietário da empresa",
        )

    mode = (
        body.mode or ""
    ).lower().strip()

    if mode == "unblock":

        u.active = True
        u.block_type = None
        u.blocked_until = None
        u.block_reason = None

        u.token_version = (
            int(
                getattr(
                    u,
                    "token_version",
                    0,
                )
                or 0
            )
            + 1
        )

        audit(
            db,
            admin,
            "DESBLOQUEIO",
            "users",
            u.id,
            request,
        )

        db.commit()

        return serialize_user(
            u,
            company,
        )

    if mode not in (
        "manual",
        "scheduled",
        "permanent",
    ):
        raise HTTPException(
            400,
            "mode inválido",
        )

    if mode == "scheduled":

        if not body.blocked_until:
            raise HTTPException(
                400,
                "Informe data e hora para desbloqueio automático",
            )

        until = body.blocked_until

        if until.tzinfo is None:
            until = until.replace(
                tzinfo=timezone.utc
            )

        u.blocked_until = until

    else:
        u.blocked_until = None

    u.active = False
    u.block_type = mode

    u.block_reason = (
        (body.reason or "")
        .strip()
        or None
    )

    u.token_version = (
        int(
            getattr(
                u,
                "token_version",
                0,
            )
            or 0
        )
        + 1
    )

    audit(
        db,
        admin,
        f"BLOQUEIO_{mode.upper()}",
        "users",
        u.id,
        request,
    )

    db.commit()

    return serialize_user(
        u,
        company,
    )


# ============================================================
# AUDITORIA
# ============================================================

@app.get("/audit")
def logs(
    user_filter: str | None = Query(
        default=None,
        alias="user",
    ),
    module: str | None = None,
    action: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    user: User = Depends(company_admin),
    db: Session = Depends(get_db),
):

    company = get_current_company(
        user,
        db,
    )

    query = (
        select(
            AuditLog,
            User.name.label("user_name"),
        )
        .outerjoin(
            User,
            AuditLog.user_id == User.id,
        )
        .where(
            AuditLog.company_id
            == company.id
        )
    )

    if user_filter and user_filter.strip():

        term = (
            f"%{user_filter.strip()}%"
        )

        query = query.where(
            (User.name.ilike(term))
            | (User.username.ilike(term))
        )

    if module and module.strip():

        query = query.where(
            AuditLog.module.ilike(
                f"%{module.strip()}%"
            )
        )

    if action and action.strip():

        query = query.where(
            AuditLog.action.ilike(
                f"%{action.strip()}%"
            )
        )

    if date_from:

        start_datetime = datetime.combine(
            date_from,
            datetime.min.time(),
        )

        query = query.where(
            AuditLog.created_at
            >= start_datetime
        )

    if date_to:

        end_datetime = datetime.combine(
            date_to + timedelta(days=1),
            datetime.min.time(),
        )

        query = query.where(
            AuditLog.created_at
            < end_datetime
        )

    rows = db.execute(
        query
        .order_by(
            AuditLog.created_at.desc()
        )
        .limit(50)
    ).all()

    window_start = (
        datetime.now(timezone.utc)
        - timedelta(minutes=10)
    )

    brute_force_counts = dict(
        db.execute(
            select(
                AuditLog.ip,
                func.count(AuditLog.id),
            )
            .where(
                AuditLog.company_id
                == company.id,
                AuditLog.action
                == "LOGIN_INVÁLIDO",
                AuditLog.ip.is_not(None),
                AuditLog.created_at
                >= window_start,
            )
            .group_by(
                AuditLog.ip
            )
        ).all()
    )

    return [
        {
            **serialize(log),
            "user_name": user_name
            or (
                "Usuário desconhecido"
                if log.action
                == "LOGIN_INVÁLIDO"
                else "Sistema"
            ),
            "is_brute_force": bool(
                log.ip
                and brute_force_counts.get(
                    log.ip,
                    0,
                )
                >= 5
            ),
        }
        for log, user_name in rows
    ]


# ============================================================
# DASHBOARD
# ============================================================

@app.get("/dashboard")
def dashboard(
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):

    require("dashboard")(user)

    company = get_current_company(
        user,
        db,
    )

    update_maintenance_status(
        db
    )

    today = date.today()

    def count(q):
        return db.scalar(q) or 0

    vehicles_in_maintenance = count(
        select(
            func.count(
                func.distinct(
                    Maintenance.vehicle_id
                )
            )
        )
        .select_from(Maintenance)
        .where(
            Maintenance.company_id
            == company.id,
            Maintenance.status
            == "Em andamento",
        )
    )

    maintenance_today = count(
        select(func.count())
        .select_from(Maintenance)
        .where(
            Maintenance.company_id
            == company.id,
            func.date(
                Maintenance.date
            ) == today,
            Maintenance.status.in_(
                [
                    "Agendado",
                    "Em andamento",
                ]
            ),
        )
    )

    maintenance_overdue = count(
        select(func.count())
        .select_from(Maintenance)
        .where(
            Maintenance.company_id
            == company.id,
            func.date(
                Maintenance.date
            ) < today,
            Maintenance.status.notin_(
                ["Concluído"]
            ),
        )
    )

    maintenance_completed = count(
        select(func.count())
        .select_from(Maintenance)
        .where(
            Maintenance.company_id
            == company.id,
            Maintenance.status
            == "Concluído",
        )
    )

    maintenance_alerts = [
        serialize(m)
        for m in db.scalars(
            select(Maintenance)
            .where(
                Maintenance.company_id
                == company.id,
                Maintenance.status
                == "Em andamento",
            )
            .order_by(
                Maintenance.date
            )
            .limit(20)
        ).all()
    ]

    routes_today = count(
        select(func.count())
        .select_from(RouteSlot)
        .where(
            RouteSlot.company_id
            == company.id,
            RouteSlot.date == today,
        )
    )

    return {
        "available": count(
            select(func.count())
            .select_from(Vehicle)
            .where(
                Vehicle.company_id
                == company.id,
                Vehicle.status
                == "Disponível",
            )
        ),

        "maintenance":
            vehicles_in_maintenance,

        "maintenance_completed":
            maintenance_completed,

        "maintenance_today":
            maintenance_today,

        "maintenance_overdue":
            maintenance_overdue,

        "routes_today":
            routes_today,

        "products": count(
            select(func.count())
            .select_from(Product)
            .where(
                Product.company_id
                == company.id
            )
        ),

        "low_stock": count(
            select(func.count())
            .select_from(Product)
            .where(
                Product.company_id
                == company.id,
                Product.quantity
                <= Product.minimum_stock,
            )
        ),

        "fuel_cost": float(
            db.scalar(
                select(
                    func.coalesce(
                        func.sum(
                            FuelRecord.total_value
                        ),
                        0,
                    )
                )
                .where(
                    FuelRecord.company_id
                    == company.id
                )
            )
            or 0
        ),

        "maintenance_alerts":
            maintenance_alerts,
    }


# ============================================================
# ESTOQUE
# ============================================================

@app.get("/stock/movements")
def movements(
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):

    require("stock")(user)

    company = get_current_company(
        user,
        db,
    )

    return [
        serialize(x)
        for x in db.scalars(
            select(StockMovement)
            .where(
                StockMovement.company_id
                == company.id
            )
            .order_by(
                StockMovement.occurred_at.desc()
            )
            .limit(500)
        ).all()
    ]


@app.post("/stock/{kind}")
def stock(
    kind: str,
    body: Movement,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):

    if kind not in (
        "entry",
        "output",
    ):
        raise HTTPException(404)

    require("stock")(user)

    company = get_current_company(
        user,
        db,
    )

    product = db.scalar(
        select(Product)
        .where(
            Product.id
            == body.product_id,
            Product.company_id
            == company.id,
        )
        .with_for_update()
    )

    if not product:
        raise HTTPException(
            404,
            "Produto não encontrado",
        )

    current_qty = float(
        product.quantity
    )

    if (
        kind == "output"
        and current_qty
        < body.quantity
    ):
        raise HTTPException(
            409,
            "Estoque insuficiente",
        )

    new_qty = (
        current_qty + body.quantity
        if kind == "entry"
        else current_qty - body.quantity
    )

    product.quantity = new_qty

    m = StockMovement(
        company_id=company.id,
        product_id=product.id,
        type=(
            "ENTRADA"
            if kind == "entry"
            else "SAÍDA"
        ),
        quantity=body.quantity,
        user_id=user.id,
        responsible=body.responsible,
        recipient=body.recipient,
        sector=body.sector,
        vehicle_id=body.vehicle_id,
        observation=body.observation,
        invoice=body.invoice,
        unit_value=body.unit_value,
    )

    db.add(m)
    db.flush()

    audit(
        db,
        user,
        m.type,
        "stock",
        m.id,
        request,
    )

    db.commit()

    return {
        "movement": serialize(m),
        "quantity": float(
            product.quantity
        ),
    }


@app.patch("/stock/movements/{movement_id}")
def edit_movement(
    movement_id: int,
    body: MovementEdit,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):

    require("stock")(user)

    if not verify_password(
        body.password,
        user.password_hash,
    ):
        raise HTTPException(
            401,
            "Senha incorreta",
        )

    company = get_current_company(
        user,
        db,
    )

    m = db.scalar(
        select(StockMovement).where(
            StockMovement.id
            == movement_id,
            StockMovement.company_id
            == company.id,
        )
    )

    if not m:
        raise HTTPException(
            404,
            "Movimentação não encontrada",
        )

    product = db.scalar(
        select(Product)
        .where(
            Product.id == m.product_id,
            Product.company_id
            == company.id,
        )
        .with_for_update()
    )

    if not product:
        raise HTTPException(
            404,
            "Produto não encontrado",
        )

    current = float(
        product.quantity
    )

    old_qty = float(
        m.quantity
    )

    current = (
        current - old_qty
        if m.type == "ENTRADA"
        else current + old_qty
    )

    new_qty = (
        body.quantity
        if body.quantity is not None
        else old_qty
    )

    if new_qty <= 0:
        raise HTTPException(
            422,
            "Quantidade deve ser maior que zero",
        )

    for field, val in (
        (
            "responsible",
            body.responsible,
        ),
        (
            "recipient",
            body.recipient,
        ),
        (
            "sector",
            body.sector,
        ),
        (
            "vehicle_id",
            body.vehicle_id,
        ),
        (
            "observation",
            body.observation,
        ),
        (
            "invoice",
            body.invoice,
        ),
        (
            "unit_value",
            body.unit_value,
        ),
    ):

        if val is not None:
            setattr(
                m,
                field,
                val,
            )

    m.quantity = new_qty

    current = (
        current + new_qty
        if m.type == "ENTRADA"
        else current - new_qty
    )

    if current < 0:
        raise HTTPException(
            409,
            "Essa alteração deixaria o estoque negativo",
        )

    product.quantity = current

    audit(
        db,
        user,
        "ALTERAÇÃO",
        "stock",
        movement_id,
        request,
    )

    db.commit()

    return serialize(m)


@app.delete("/stock/movements/{movement_id}")
def delete_movement(
    movement_id: int,
    body: MovementDelete,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):

    require("stock")(user)

    if not verify_password(
        body.password,
        user.password_hash,
    ):
        raise HTTPException(
            401,
            "Senha incorreta",
        )

    company = get_current_company(
        user,
        db,
    )

    m = db.scalar(
        select(StockMovement).where(
            StockMovement.id
            == movement_id,
            StockMovement.company_id
            == company.id,
        )
    )

    if not m:
        raise HTTPException(
            404,
            "Movimentação não encontrada",
        )

    product = db.scalar(
        select(Product)
        .where(
            Product.id == m.product_id,
            Product.company_id
            == company.id,
        )
        .with_for_update()
    )

    if product:

        qty = float(
            m.quantity
        )

        new_qty = (
            float(product.quantity)
            - qty
            if m.type == "ENTRADA"
            else float(product.quantity)
            + qty
        )

        if new_qty < 0:
            raise HTTPException(
                409,
                "Não é possível excluir: deixaria o estoque negativo",
            )

        product.quantity = new_qty

    db.delete(m)

    audit(
        db,
        user,
        "EXCLUSÃO",
        "stock",
        movement_id,
        request,
    )

    db.commit()

    return {
        "ok": True
    }


@app.post("/stock/movements/{movement_id}/delete")
def delete_movement_post(
    movement_id: int,
    body: MovementDelete,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):

    return delete_movement(
        movement_id,
        body,
        request,
        user,
        db,
    )


# ============================================================
# SETTINGS
# ============================================================

@app.patch("/settings/{key}")
def edit_setting(
    key: str,
    body: Payload,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):

    require("settings")(user)

    company = get_current_company(
        user,
        db,
    )

    s = db.scalar(
        select(Setting).where(
            Setting.company_id
            == company.id,
            Setting.key == key,
        )
    )

    if not s:

        s = Setting(
            company_id=company.id,
            key=key,
        )

        db.add(s)

    if "value" in body.data:
        s.value = body.data["value"]

    audit(
        db,
        user,
        "ALTERAÇÃO",
        "settings",
        key,
        request,
    )

    db.commit()

    return serialize(s)


@app.delete("/settings/{key}")
def delete_setting(
    key: str,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):

    require("settings")(user)

    company = get_current_company(
        user,
        db,
    )

    s = db.scalar(
        select(Setting).where(
            Setting.company_id
            == company.id,
            Setting.key == key,
        )
    )

    if not s:
        raise HTTPException(
            404,
            "Configuração não encontrada",
        )

    db.delete(s)

    audit(
        db,
        user,
        "EXCLUSÃO",
        "settings",
        key,
        request,
    )

    db.commit()

    return {
        "ok": True
    }


# ============================================================
# RESOURCES
# ============================================================

RESOURCES = {
    "customers": (
        Customer,
        "customers",
    ),
    "vehicles": (
        Vehicle,
        "vehicles",
    ),
    "drivers": (
        Driver,
        "drivers",
    ),
    "routes": (
        Route,
        "routes",
    ),
    "route-stops": (
        RouteStop,
        "routes",
    ),
    "maintenance": (
        Maintenance,
        "maintenance",
    ),
    "fuel": (
        FuelRecord,
        "fuel",
    ),
    "products": (
        Product,
        "stock",
    ),
    "settings": (
        Setting,
        "settings",
    ),
}


# ============================================================
# PEDIDOS
# ============================================================

class OrderBody(BaseModel):
    model: str = Field(
        min_length=1,
        max_length=120,
    )

    cabling: str | None = None
    breaker: str | None = None
    height: str | None = None

    quantity: float = Field(
        default=1,
        gt=0,
    )

    order_date: date
    ship_date: date | None = None

    status: str = "pendente"

    branch: str | None = None
    notes: str | None = None


class OrderDeleteBody(BaseModel):
    password: str


def _norm_order_status(
    s: str,
) -> str:

    s = (
        s or "pendente"
    ).strip().lower()

    if s not in (
        "pendente",
        "atrasado",
        "entregue",
    ):
        raise HTTPException(
            422,
            "Status inválido: use pendente, atrasado ou entregue",
        )

    return s


@app.get("/orders")
def list_orders(
    status: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):

    require("orders")(user)

    company = get_current_company(
        user,
        db,
    )

    q = (
        select(Order)
        .where(
            Order.company_id
            == company.id
        )
        .order_by(
            Order.order_date.desc(),
            Order.id.desc(),
        )
    )

    if status:
        q = q.where(
            Order.status
            == _norm_order_status(status)
        )

    if date_from:
        q = q.where(
            Order.order_date
            >= date_from
        )

    if date_to:
        q = q.where(
            Order.order_date
            <= date_to
        )

    return [
        serialize(x)
        for x in db.scalars(q).all()
    ]


@app.post("/orders")
def create_order(
    body: OrderBody,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):

    require("orders")(user)

    company = get_current_company(
        user,
        db,
    )

    o = Order(
        company_id=company.id,
        model=body.model.strip(),
        cabling=(
            body.cabling or ""
        ).strip()
        or None,
        breaker=(
            body.breaker or ""
        ).strip()
        or None,
        height=(
            body.height or ""
        ).strip()
        or None,
        quantity=body.quantity,
        order_date=body.order_date,
        ship_date=body.ship_date,
        status=_norm_order_status(
            body.status
        ),
        branch=(
            body.branch or ""
        ).strip()
        or None,
        notes=(
            body.notes or ""
        ).strip()
        or None,
        created_by=user.id,
    )

    db.add(o)
    db.flush()

    audit(
        db,
        user,
        "CADASTRO",
        "orders",
        o.id,
        request,
    )

    db.commit()

    return serialize(o)


@app.patch("/orders/{order_id}")
def update_order(
    order_id: int,
    body: OrderBody,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):

    require("orders")(user)

    company = get_current_company(
        user,
        db,
    )

    o = db.scalar(
        select(Order).where(
            Order.id == order_id,
            Order.company_id
            == company.id,
        )
    )

    if not o:
        raise HTTPException(
            404,
            "Pedido não encontrado",
        )

    o.model = body.model.strip()

    o.cabling = (
        body.cabling or ""
    ).strip() or None

    o.breaker = (
        body.breaker or ""
    ).strip() or None

    o.height = (
        body.height or ""
    ).strip() or None

    o.quantity = body.quantity
    o.order_date = body.order_date
    o.ship_date = body.ship_date

    o.status = _norm_order_status(
        body.status
    )

    o.branch = (
        body.branch or ""
    ).strip() or None

    o.notes = (
        body.notes or ""
    ).strip() or None

    audit(
        db,
        user,
        "ALTERAÇÃO",
        "orders",
        order_id,
        request,
    )

    db.commit()

    return serialize(o)


@app.post("/orders/{order_id}/delete")
def delete_order(
    order_id: int,
    body: OrderDeleteBody,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):

    require("orders")(user)

    if not verify_password(
        body.password,
        user.password_hash,
    ):
        raise HTTPException(
            401,
            "Senha incorreta",
        )

    company = get_current_company(
        user,
        db,
    )

    o = db.scalar(
        select(Order).where(
            Order.id == order_id,
            Order.company_id
            == company.id,
        )
    )

    if not o:
        raise HTTPException(
            404,
            "Pedido não encontrado",
        )

    db.delete(o)

    audit(
        db,
        user,
        "EXCLUSÃO",
        "orders",
        order_id,
        request,
    )

    db.commit()

    return {
        "ok": True
    }


# ============================================================
# CRUD GENÉRICO
# ============================================================

@app.get("/{resource}")
def list_resource(
    resource: str,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):

    if resource not in RESOURCES:
        raise HTTPException(404)

    model, module = RESOURCES[
        resource
    ]

    require(module)(user)

    company = get_current_company(
        user,
        db,
    )

    if not hasattr(
        model,
        "company_id",
    ):
        raise HTTPException(
            500,
            f"Recurso {resource} não possui isolamento por empresa.",
        )

    if resource == "maintenance":
        update_maintenance_status(
            db
        )

    q = (
        select(model)
        .where(
            model.company_id
            == company.id
        )
        .limit(500)
    )

    return [
        serialize(x)
        for x in db.scalars(q).all()
    ]


@app.post("/{resource}")
def add_resource(
    resource: str,
    body: Payload,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    if resource not in RESOURCES:
        raise HTTPException(
            status_code=404,
            detail="Recurso não encontrado.",
        )

    model, module = RESOURCES[resource]

    require(module)(user)

    company = get_current_company(user, db)

    if not hasattr(model, "company_id"):
        raise HTTPException(
            status_code=500,
            detail=f"Recurso {resource} não possui company_id.",
        )

    data = dict(body.data)

    data.pop("company_id", None)

    if resource == "drivers":
        if "cpf" in data:
            data["cpf"] = normalize_cpf(data.get("cpf"))

        if "cnh" in data:
            cnh = (data.get("cnh") or "").strip()
            data["cnh"] = cnh or None

    if resource == "vehicles":

        # Nunca permitir que o frontend escolha o ID
        data.pop("id", None)

        # Normalizar placa
        plate = str(data.get("plate") or "").strip().upper()

        if not plate:
            raise HTTPException(
                status_code=400,
                detail="A placa do veículo é obrigatória.",
            )

        # Verificar duplicidade somente dentro da empresa atual
        existing_vehicle = (
            db.query(model)
            .filter(
                model.company_id == company.id,
                model.plate == plate,
            )
            .first()
        )

        if existing_vehicle:
            raise HTTPException(
                status_code=409,
                detail=f"A placa {plate} já está cadastrada nesta empresa.",
            )

        data["plate"] = plate

    if resource == "products":
        if data.get("code"):
            data["code"] = str(data["code"]).strip()

    model_values = model_data(
        model,
        data,
    )

    model_values["company_id"] = company.id

    x = model(**model_values)

    db.add(x)

    try:
        db.flush()

    except IntegrityError as exc:
        db.rollback()

        if resource == "vehicles":
            raise HTTPException(
                status_code=409,
                detail=f"A placa {data.get('plate')} já está cadastrada nesta empresa.",
            ) from exc

        if resource == "drivers" and data.get("email"):
            raise HTTPException(
                status_code=409,
                detail="Este e-mail já está cadastrado nesta empresa.",
            ) from exc

        if resource == "products" and data.get("code"):
            raise HTTPException(
                status_code=409,
                detail="Este código de produto já está cadastrado nesta empresa.",
            ) from exc

        raise HTTPException(
            status_code=409,
            detail="Não foi possível cadastrar o registro. Verifique os dados informados.",
        ) from exc

    audit(
        db,
        user,
        "CADASTRO",
        module,
        getattr(
            x,
            "id",
            None,
        ),
        request,
    )

    db.commit()

    return serialize(x)

@app.patch("/{resource}/{record_id}")
def edit_resource(
    resource: str,
    record_id: int,
    body: Payload,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    if resource not in RESOURCES:
        raise HTTPException(404)

    model, module = RESOURCES[resource]
    require(module)(user)

    company = get_current_company(user, db)

    if not hasattr(model, "company_id"):
        raise HTTPException(
            500,
            f"Recurso {resource} não possui company_id.",
        )

    x = db.scalar(
        select(model).where(
            model.id == record_id,
            model.company_id == company.id,
        )
    )

    if not x:
        raise HTTPException(
            404,
            "Registro não encontrado",
        )

    data = dict(body.data)

    # Nunca permitir troca de empresa
    data.pop("company_id", None)

    # ==========================================================
    # MOTORISTAS
    # ==========================================================
    if resource == "drivers":
        if "cpf" in data:
            data["cpf"] = normalize_cpf(data.get("cpf"))

        if "cnh" in data:
            cnh = (data.get("cnh") or "").strip()
            data["cnh"] = cnh or None

    # ==========================================================
    # VEÍCULOS
    # ==========================================================
    if resource == "vehicles":
        # Nunca permitir alteração do ID
        data.pop("id", None)

        if "plate" in data:
            plate = str(data.get("plate") or "").strip().upper()

            if not plate:
                raise HTTPException(
                    status_code=400,
                    detail="A placa do veículo é obrigatória.",
                )

            # Procurar placa duplicada somente na empresa atual.
            # O próprio veículo que está sendo editado é ignorado.
            existing_vehicle = (
                db.query(model)
                .filter(
                    model.company_id == company.id,
                    model.plate == plate,
                    model.id != record_id,
                )
                .first()
            )

            if existing_vehicle:
                raise HTTPException(
                    status_code=409,
                    detail=f"A placa {plate} já está cadastrada nesta empresa.",
                )

            data["plate"] = plate

    # ==========================================================
    # PRODUTOS
    # ==========================================================
    if resource == "products":
        if data.get("code"):
            data["code"] = str(data["code"]).strip()

    # ==========================================================
    # APLICAR ALTERAÇÕES
    # ==========================================================
    for k, v in model_data(
        model,
        data,
    ).items():
        setattr(
            x,
            k,
            v,
        )

    try:
        db.flush()

        audit(
            db,
            user,
            "ALTERAÇÃO",
            module,
            record_id,
            request,
        )

        db.commit()

    except IntegrityError as exc:
        db.rollback()

        # Não afirmar que é placa duplicada sem confirmação.
        if resource == "vehicles":
            raise HTTPException(
                status_code=409,
                detail="Não foi possível alterar o veículo. Verifique os dados informados e tente novamente.",
            ) from exc

        if resource == "drivers" and "email" in data:
            raise HTTPException(
                status_code=409,
                detail="Este e-mail já está cadastrado nesta empresa.",
            ) from exc

        if resource == "products" and "code" in data:
            raise HTTPException(
                status_code=409,
                detail="Este código de produto já está cadastrado nesta empresa.",
            ) from exc

        raise HTTPException(
            status_code=409,
            detail="Já existe um registro com os mesmos dados.",
        ) from exc

    return serialize(x)



@app.delete("/{resource}/{record_id}")
def delete_resource(
    resource: str,
    record_id: int,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):

    if resource not in RESOURCES:
        raise HTTPException(404)

    model, module = RESOURCES[
        resource
    ]

    require(module, write=True)(user)

    company = get_current_company(
        user,
        db,
    )

    if not hasattr(
        model,
        "company_id",
    ):
        raise HTTPException(
            500,
            f"Recurso {resource} não possui company_id.",
        )

    x = db.scalar(
        select(model).where(
            model.id == record_id,
            model.company_id
            == company.id,
        )
    )

    if not x:
        raise HTTPException(
            404,
            "Registro não encontrado",
        )

    if resource == "products":

        movement_count = db.scalar(
            select(func.count())
            .select_from(StockMovement)
            .where(
                StockMovement.product_id == record_id,
                StockMovement.company_id == company.id,
            )
        ) or 0

        if movement_count:
            raise HTTPException(
                409,
                "Não é possível excluir: este produto possui movimentações de estoque registradas.",
            )

    try:

        db.delete(x)
        db.flush()

    except IntegrityError as exc:

        db.rollback()

        raise HTTPException(
            409,
            "Não é possível excluir: este registro possui outros dados vinculados.",
        ) from exc

    audit(
        db,
        user,
        "EXCLUSÃO",
        module,
        record_id,
        request,
    )

    db.commit()

    return {
        "ok": True
    }


# ============================================================
# AGENDAMENTO
# ============================================================

class RouteSlotCreate(BaseModel):
    week_id: int
    date: date
    region_code: str = Field(
        min_length=1,
        max_length=10,
    )
    route_label: str | None = None
    total_slots: int = Field(
        ge=0
    )
    driver_id: int | None = None
    second_driver_id: int | None = None
    vehicle_id: int | None = None
    notes: str | None = None


class RouteSlotUpdate(BaseModel):
    region_code: str | None = None
    route_label: str | None = None
    total_slots: int | None = Field(
        default=None,
        ge=0,
    )
    driver_id: int | None = None
    second_driver_id: int | None = None
    vehicle_id: int | None = None
    closed: bool | None = None
    notes: str | None = None


class ScheduleEntryCreate(BaseModel):
    route_slot_id: int
    service_description: str = Field(
        min_length=1,
        max_length=200,
    )
    client_name: str = Field(
        min_length=1,
        max_length=120,
    )
    phone: str | None = None
    location_link: str | None = None
    no_comanda: bool = False
    comanda: str | None = None
    cooperativa: bool = False
    cooperativa_nome: str | None = None
    pago: bool = False
    slots_consumed: int | None = None
    status: str = "Normal"
    observation: str | None = None


class ScheduleEntryUpdate(BaseModel):
    service_description: str | None = None
    client_name: str | None = None
    phone: str | None = None
    location_link: str | None = None
    no_comanda: bool | None = None
    comanda: str | None = None
    cooperativa: bool | None = None
    cooperativa_nome: str | None = None
    pago: bool | None = None
    slots_consumed: int | None = None
    status: str | None = None
    observation: str | None = None


class ScheduleExtraCreate(BaseModel):
    entry_id: int
    description: str = Field(
        min_length=1,
        max_length=200,
    )
    observation: str | None = None
    status: str = "Normal"


class ScheduleWeekCreate(BaseModel):
    start_date: date
    label: str | None = None


class MoveEntryBody(BaseModel):
    direction: str


class ReorderEntriesBody(BaseModel):
    route_slot_id: int
    ordered_ids: list[int]


class TransferEntryBody(BaseModel):
    target_route_slot_id: int


class TransferSlotBody(BaseModel):
    new_date: date
    week_id: int | None = None


class DeleteWeekBody(BaseModel):
    password: str


def calcular_vagas(
    service_description: str,
) -> int:

    match = re.match(
        r"^(\d+)",
        (service_description or "").strip(),
    )

    return (
        int(match.group(1))
        if match
        else 0
    )


def serialize_extra(
    x: ScheduleExtra,
):
    return serialize(x)


def serialize_entry(
    x: ScheduleEntry,
    db: Session,
    extras_by_entry: dict | None = None,
):
    """
    Serializa um ScheduleEntry.

    Se `extras_by_entry` for passado (mapa entry_id -> lista de ScheduleExtra
    já carregado em bloco), não faz nenhuma query extra. Sem ele, mantém o
    comportamento antigo (uma query por entry) para não quebrar quem chamar
    esta função isoladamente.
    """

    d = serialize(x)

    if extras_by_entry is not None:
        extras = extras_by_entry.get(x.id, [])
    else:
        extras = db.scalars(
            select(ScheduleExtra).where(
                ScheduleExtra.entry_id == x.id,
                ScheduleExtra.company_id == x.company_id,
            )
        ).all()

    d["extras"] = [
        serialize_extra(e)
        for e in extras
    ]

    d["comanda"] = x.comanda
    d["pago"] = bool(x.pago)
    d["cooperativa_nome"] = (
        x.cooperativa_nome
    )

    d["slots_consumed"] = (
        x.slots_consumed
        if x.slots_consumed is not None
        else calcular_vagas(
            x.service_description
        )
    )

    return d


def serialize_route_slot(
    x: RouteSlot,
    db: Session,
    entries_by_slot: dict | None = None,
    extras_by_entry: dict | None = None,
    drivers_by_id: dict | None = None,
    vehicles_by_id: dict | None = None,
):
    """
    Serializa um RouteSlot. Aceita mapas pré-carregados em bloco
    (entries_by_slot, extras_by_entry, drivers_by_id, vehicles_by_id) para
    evitar uma query separada por slot/entry/driver/vehicle. Sem eles, cai
    de volta no comportamento antigo (uma query por lookup).
    """

    d = serialize(x)

    if entries_by_slot is not None:
        entries = entries_by_slot.get(x.id, [])
    else:
        entries = db.scalars(
            select(ScheduleEntry)
            .where(
                ScheduleEntry.route_slot_id == x.id,
                ScheduleEntry.company_id == x.company_id,
            )
            .order_by(ScheduleEntry.position)
        ).all()

    d["entries"] = [
        serialize_entry(e, db, extras_by_entry=extras_by_entry)
        for e in entries
    ]

    used = sum(
        (
            e.slots_consumed
            or calcular_vagas(
                e.service_description
            )
        )
        for e in entries
    )

    d["slots_used"] = used

    d["slots_available"] = max(
        x.total_slots - used,
        0,
    )

    if drivers_by_id is not None:
        driver = drivers_by_id.get(x.driver_id) if x.driver_id else None
        second_driver = (
            drivers_by_id.get(x.second_driver_id)
            if x.second_driver_id
            else None
        )
    else:
        driver = (
            db.scalar(
                select(Driver).where(
                    Driver.id == x.driver_id,
                    Driver.company_id == x.company_id,
                )
            )
            if x.driver_id
            else None
        )
        second_driver = (
            db.scalar(
                select(Driver).where(
                    Driver.id == x.second_driver_id,
                    Driver.company_id == x.company_id,
                )
            )
            if x.second_driver_id
            else None
        )

    if vehicles_by_id is not None:
        vehicle = vehicles_by_id.get(x.vehicle_id) if x.vehicle_id else None
    else:
        vehicle = (
            db.scalar(
                select(Vehicle).where(
                    Vehicle.id == x.vehicle_id,
                    Vehicle.company_id == x.company_id,
                )
            )
            if x.vehicle_id
            else None
        )

    d["driver"] = (
        serialize(driver)
        if driver
        else None
    )

    d["second_driver"] = (
        serialize(second_driver)
        if second_driver
        else None
    )

    d["vehicle"] = (
        serialize(vehicle)
        if vehicle
        else None
    )

    return d


def serialize_week(
    x: ScheduleWeek,
    db: Session,
    slots_by_week: dict | None = None,
    entries_by_slot: dict | None = None,
    extras_by_entry: dict | None = None,
    drivers_by_id: dict | None = None,
    vehicles_by_id: dict | None = None,
):
    """
    Serializa uma ScheduleWeek. Aceita mapas pré-carregados em bloco (ver
    load_schedule_weeks_bulk) para evitar N+1 queries. Sem eles, mantém o
    comportamento antigo (uma query por semana/rota/cliente).
    """

    if slots_by_week is not None:
        slots = slots_by_week.get(x.id, [])
    else:
        slots = db.scalars(
            select(RouteSlot)
            .where(
                RouteSlot.week_id == x.id,
                RouteSlot.company_id == x.company_id,
            )
            .order_by(RouteSlot.date, RouteSlot.id)
        ).all()

    d = serialize(x)

    d["route_slots"] = [
        serialize_route_slot(
            s,
            db,
            entries_by_slot=entries_by_slot,
            extras_by_entry=extras_by_entry,
            drivers_by_id=drivers_by_id,
            vehicles_by_id=vehicles_by_id,
        )
        for s in slots
    ]

    return d


def load_schedule_weeks_bulk(
    weeks: list["ScheduleWeek"],
    company_id: int,
    db: Session,
):
    """
    Carrega em poucas queries (em vez de uma por semana/rota/cliente/extra)
    tudo o que é necessário para serializar uma lista de ScheduleWeek, e
    devolve os mapas prontos para passar a serialize_week.

    Isso substitui o padrão N+1 que existia antes (centenas de queries por
    chamada a GET /schedule/weeks) por um total fixo de 5 queries,
    independente de quantas semanas/rotas/clientes existam.
    """

    week_ids = [w.id for w in weeks]

    if not week_ids:
        return {}, {}, {}, {}, {}

    slots = db.scalars(
        select(RouteSlot)
        .where(
            RouteSlot.week_id.in_(week_ids),
            RouteSlot.company_id == company_id,
        )
        .order_by(RouteSlot.date, RouteSlot.id)
    ).all()

    slots_by_week: dict = {}
    for s in slots:
        slots_by_week.setdefault(s.week_id, []).append(s)

    slot_ids = [s.id for s in slots]

    entries = (
        db.scalars(
            select(ScheduleEntry)
            .where(
                ScheduleEntry.route_slot_id.in_(slot_ids),
                ScheduleEntry.company_id == company_id,
            )
            .order_by(ScheduleEntry.position)
        ).all()
        if slot_ids
        else []
    )

    entries_by_slot: dict = {}
    for e in entries:
        entries_by_slot.setdefault(e.route_slot_id, []).append(e)

    entry_ids = [e.id for e in entries]

    extras = (
        db.scalars(
            select(ScheduleExtra).where(
                ScheduleExtra.entry_id.in_(entry_ids),
                ScheduleExtra.company_id == company_id,
            )
        ).all()
        if entry_ids
        else []
    )

    extras_by_entry: dict = {}
    for ex in extras:
        extras_by_entry.setdefault(ex.entry_id, []).append(ex)

    driver_ids = {
        did
        for s in slots
        for did in (s.driver_id, s.second_driver_id)
        if did
    }

    drivers_by_id = (
        {
            d.id: d
            for d in db.scalars(
                select(Driver).where(
                    Driver.id.in_(driver_ids),
                    Driver.company_id == company_id,
                )
            ).all()
        }
        if driver_ids
        else {}
    )

    vehicle_ids = {s.vehicle_id for s in slots if s.vehicle_id}

    vehicles_by_id = (
        {
            v.id: v
            for v in db.scalars(
                select(Vehicle).where(
                    Vehicle.id.in_(vehicle_ids),
                    Vehicle.company_id == company_id,
                )
            ).all()
        }
        if vehicle_ids
        else {}
    )

    return (
        slots_by_week,
        entries_by_slot,
        extras_by_entry,
        drivers_by_id,
        vehicles_by_id,
    )


# ============================================================
# SEMANAS
# ============================================================

@app.get("/schedule/version")
def get_schedule_version(
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    """
    Endpoint deliberadamente barato (leitura de 1 linha por PK) para o
    frontend usar no polling de 15s do Agendamento. Ele só busca o payload
    completo em GET /schedule/weeks quando este número muda em relação ao
    que já tem em memória — evita reprocessar e retransmitir a agenda
    inteira a cada poll quando nada mudou.
    """

    require("schedule")(user)

    company = get_current_company(user, db)

    row = db.get(ScheduleVersion, company.id)

    return {"version": row.version if row else 0}


@app.get("/schedule/weeks")
def list_schedule_weeks(
    status: str | None = None,
    include_archived: bool = False,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):

    require("schedule")(user)

    company = get_current_company(
        user,
        db,
    )

    q = (
        select(ScheduleWeek)
        .where(
            ScheduleWeek.company_id
            == company.id
        )
        .order_by(
            ScheduleWeek.start_date
        )
    )

    if status == "ativa":

        q = q.where(
            ScheduleWeek.status
            == WeekStatus.ATIVA
        )

    elif not include_archived:
        # O frontend manda ?include_archived=false por padrão (checkbox
        # "mostrar arquivadas" desmarcada); antes esse parâmetro não existia
        # aqui e era ignorado, então semanas arquivadas sempre apareciam.
        q = q.where(
            ScheduleWeek.status
            != WeekStatus.ARQUIVADA
        )

    weeks = db.scalars(
        q
    ).all()

    (
        slots_by_week,
        entries_by_slot,
        extras_by_entry,
        drivers_by_id,
        vehicles_by_id,
    ) = load_schedule_weeks_bulk(weeks, company.id, db)

    return [
        serialize_week(
            w,
            db,
            slots_by_week=slots_by_week,
            entries_by_slot=entries_by_slot,
            extras_by_entry=extras_by_entry,
            drivers_by_id=drivers_by_id,
            vehicles_by_id=vehicles_by_id,
        )
        for w in weeks
    ]


@app.post("/schedule/weeks")
def create_schedule_week(
    body: ScheduleWeekCreate,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):

    require(
        "schedule",
        write=True,
    )(user)

    company = get_current_company(
        user,
        db,
    )

    w = ScheduleWeek(
        company_id=company.id,
        start_date=body.start_date,
        label=body.label,
        status=WeekStatus.ATIVA,
    )

    db.add(w)
    db.flush()

    audit(
        db,
        user,
        "CRIAÇÃO_SEMANA",
        "schedule",
        w.id,
        request,
    )

    db.commit()

    return serialize_week(
        w,
        db,
    )


@app.delete("/schedule/weeks/{week_id}")
def delete_schedule_week(
    week_id: int,
    body: DeleteWeekBody,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):

    require(
        "schedule",
        write=True,
    )(user)

    if user.role != Role.ADMIN:
        permissions = {
            p.strip()
            for p in (
                user.permissions
                or ""
            ).split(",")
            if p.strip()
        }

        if (
            "schedule_delete"
            not in permissions
            and "*"
            not in permissions
        ):
            raise HTTPException(
                403,
                "Você não possui permissão para excluir semanas permanentemente",
            )

    if not verify_password(
        body.password,
        user.password_hash,
    ):
        raise HTTPException(
            401,
            "Senha incorreta",
        )

    company = get_current_company(
        user,
        db,
    )

    w = db.scalar(
        select(ScheduleWeek).where(
            ScheduleWeek.id == week_id,
            ScheduleWeek.company_id
            == company.id,
        )
    )

    if not w:
        raise HTTPException(
            404,
            "Semana não encontrada",
        )

    db.delete(w)

    audit(
        db,
        user,
        "EXCLUSÃO_SEMANA",
        "schedule",
        week_id,
        request,
    )

    db.commit()

    return {
        "ok": True
    }


@app.post("/schedule/weeks/{week_id}/archive")
def archive_schedule_week(
    week_id: int,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):

    require(
        "schedule",
        write=True,
    )(user)

    if user.role != Role.ADMIN:

        permissions = {
            p.strip()
            for p in (
                user.permissions
                or ""
            ).split(",")
            if p.strip()
        }

        if (
            "schedule_archive"
            not in permissions
            and "*"
            not in permissions
        ):
            raise HTTPException(
                403,
                "Você não possui permissão para arquivar semanas.",
            )

    company = get_current_company(
        user,
        db,
    )

    w = db.scalar(
        select(ScheduleWeek).where(
            ScheduleWeek.id == week_id,
            ScheduleWeek.company_id
            == company.id,
        )
    )

    if not w:
        raise HTTPException(
            404,
            "Semana não encontrada",
        )

    w.status = WeekStatus.ARQUIVADA
    w.archived_at = func.now()

    audit(
        db,
        user,
        "ARQUIVAMENTO_SEMANA",
        "schedule",
        week_id,
        request,
    )

    db.commit()

    return {
        "ok": True
    }


# ============================================================
# ROTAS
# ============================================================

@app.post("/schedule/route-slots")
def create_route_slot(
    body: RouteSlotCreate,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):

    require(
        "schedule",
        write=True,
    )(user)

    company = get_current_company(
        user,
        db,
    )

    week = db.scalar(
        select(ScheduleWeek).where(
            ScheduleWeek.id
            == body.week_id,
            ScheduleWeek.company_id
            == company.id,
        )
    )

    if not week:
        raise HTTPException(
            404,
            "Semana não encontrada",
        )

    if week.status != WeekStatus.ATIVA:
        raise HTTPException(
            409,
            "Não é possível adicionar rota em semana arquivada",
        )

    # Validar motorista
    for driver_id in (
        body.driver_id,
        body.second_driver_id,
    ):

        if driver_id:

            driver = db.scalar(
                select(Driver).where(
                    Driver.id == driver_id,
                    Driver.company_id
                    == company.id,
                )
            )

            if not driver:
                raise HTTPException(
                    404,
                    "Motorista não encontrado",
                )

    # Validar veículo
    if body.vehicle_id:

        vehicle = db.scalar(
            select(Vehicle).where(
                Vehicle.id
                == body.vehicle_id,
                Vehicle.company_id
                == company.id,
            )
        )

        if not vehicle:
            raise HTTPException(
                404,
                "Veículo não encontrado",
            )

    rs = RouteSlot(
        company_id=company.id,
        week_id=body.week_id,
        date=body.date,
        region_code=body.region_code.upper().strip(),
        route_label=body.route_label,
        total_slots=body.total_slots,
        driver_id=body.driver_id,
        second_driver_id=body.second_driver_id,
        vehicle_id=body.vehicle_id,
        notes=body.notes,
        closed=False,
    )

    db.add(rs)
    db.flush()

    audit(
        db,
        user,
        "CRIAÇÃO_ROTA",
        "schedule",
        rs.id,
        request,
    )

    db.commit()

    return serialize_route_slot(
        rs,
        db,
    )


@app.patch("/schedule/route-slots/{slot_id}")
def update_route_slot(
    slot_id: int,
    body: RouteSlotUpdate,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):

    require(
        "schedule",
        write=True,
    )(user)

    company = get_current_company(
        user,
        db,
    )

    rs = db.scalar(
        select(RouteSlot).where(
            RouteSlot.id == slot_id,
            RouteSlot.company_id
            == company.id,
        )
    )

    if not rs:
        raise HTTPException(
            404,
            "Rota não encontrada",
        )

    data = body.model_dump(
        exclude_unset=True
    )

    if (
        "driver_id" in data
        and data["driver_id"]
    ):

        driver = db.scalar(
            select(Driver).where(
                Driver.id
                == data["driver_id"],
                Driver.company_id
                == company.id,
            )
        )

        if not driver:
            raise HTTPException(
                404,
                "Motorista não encontrado",
            )

    if (
        "second_driver_id" in data
        and data["second_driver_id"]
    ):

        driver = db.scalar(
            select(Driver).where(
                Driver.id
                == data[
                    "second_driver_id"
                ],
                Driver.company_id
                == company.id,
            )
        )

        if not driver:
            raise HTTPException(
                404,
                "Segundo motorista não encontrado",
            )

    if (
        "vehicle_id" in data
        and data["vehicle_id"]
    ):

        vehicle = db.scalar(
            select(Vehicle).where(
                Vehicle.id
                == data["vehicle_id"],
                Vehicle.company_id
                == company.id,
            )
        )

        if not vehicle:
            raise HTTPException(
                404,
                "Veículo não encontrado",
            )

    for k, v in data.items():

        if k == "region_code" and v:
            v = v.upper().strip()

        setattr(
            rs,
            k,
            v,
        )

    audit(
        db,
        user,
        "ALTERAÇÃO",
        "schedule",
        slot_id,
        request,
    )

    db.commit()

    return serialize_route_slot(
        rs,
        db,
    )


@app.delete("/schedule/route-slots/{slot_id}")
def delete_route_slot(
    slot_id: int,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):

    require(
        "schedule",
        write=True,
    )(user)

    company = get_current_company(
        user,
        db,
    )

    rs = db.scalar(
        select(RouteSlot).where(
            RouteSlot.id == slot_id,
            RouteSlot.company_id
            == company.id,
        )
    )

    if not rs:
        raise HTTPException(
            404,
            "Rota não encontrada",
        )

    db.delete(rs)

    audit(
        db,
        user,
        "EXCLUSÃO",
        "schedule",
        slot_id,
        request,
    )

    db.commit()

    return {
        "ok": True
    }


# ============================================================
# CLIENTES DA ROTA
# ============================================================

@app.post("/schedule/entries")
def create_schedule_entry(
    body: ScheduleEntryCreate,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):

    require(
        "schedule",
        write=True,
    )(user)

    company = get_current_company(
        user,
        db,
    )

    rs = db.scalar(
        select(RouteSlot).where(
            RouteSlot.id
            == body.route_slot_id,
            RouteSlot.company_id
            == company.id,
        )
    )

    if not rs:
        raise HTTPException(
            404,
            "Rota não encontrada",
        )

    if rs.closed:
        raise HTTPException(
            409,
            "Esta rota está fechada para novos clientes",
        )

    slots_needed = (
        body.slots_consumed
        or calcular_vagas(
            body.service_description
        )
    )

    entries = db.scalars(
        select(ScheduleEntry).where(
            ScheduleEntry.route_slot_id
            == rs.id,
            ScheduleEntry.company_id
            == company.id,
        )
    ).all()

    used = sum(
        (
            e.slots_consumed
            or calcular_vagas(
                e.service_description
            )
        )
        for e in entries
    )

    if (
        rs.total_slots
        and used + slots_needed
        > rs.total_slots
    ):
        raise HTTPException(
            409,
            "Não há vagas suficientes nesta rota",
        )

    entry = ScheduleEntry(
        company_id=company.id,
        route_slot_id=rs.id,
        position=len(entries) + 1,
        service_description=body.service_description,
        client_name=body.client_name,
        phone=body.phone,
        location_link=body.location_link,
        no_comanda=body.no_comanda,
        comanda=body.comanda,
        cooperativa=body.cooperativa,
        cooperativa_nome=body.cooperativa_nome,
        pago=body.pago,
        slots_consumed=slots_needed,
        status=body.status,
        observation=body.observation,
    )

    db.add(entry)
    db.flush()

    audit(
        db,
        user,
        "CADASTRO",
        "schedule",
        entry.id,
        request,
    )

    db.commit()

    return serialize_entry(
        entry,
        db,
    )


@app.patch("/schedule/entries/{entry_id}")
def update_schedule_entry(
    entry_id: int,
    body: ScheduleEntryUpdate,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):

    require(
        "schedule",
        write=True,
    )(user)

    company = get_current_company(
        user,
        db,
    )

    entry = db.scalar(
        select(ScheduleEntry).where(
            ScheduleEntry.id
            == entry_id,
            ScheduleEntry.company_id
            == company.id,
        )
    )

    if not entry:
        raise HTTPException(
            404,
            "Cliente não encontrado",
        )

    data = body.model_dump(
        exclude_unset=True
    )

    if (
        "service_description"
        in data
        and "slots_consumed"
        not in data
    ):
        data["slots_consumed"] = (
            calcular_vagas(
                data[
                    "service_description"
                ]
            )
        )

    for k, v in data.items():
        setattr(
            entry,
            k,
            v,
        )

    audit(
        db,
        user,
        "ALTERAÇÃO",
        "schedule",
        entry_id,
        request,
    )

    db.commit()

    return serialize_entry(
        entry,
        db,
    )


@app.delete("/schedule/entries/{entry_id}")
def delete_schedule_entry(
    entry_id: int,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):

    require(
        "schedule",
        write=True,
    )(user)

    company = get_current_company(
        user,
        db,
    )

    entry = db.scalar(
        select(ScheduleEntry).where(
            ScheduleEntry.id
            == entry_id,
            ScheduleEntry.company_id
            == company.id,
        )
    )

    if not entry:
        raise HTTPException(
            404,
            "Cliente não encontrado",
        )

    slot_id = entry.route_slot_id
    removed_pos = entry.position

    db.delete(entry)
    db.flush()

    later = db.scalars(
        select(ScheduleEntry).where(
            ScheduleEntry.route_slot_id
            == slot_id,
            ScheduleEntry.company_id
            == company.id,
            ScheduleEntry.position
            > removed_pos,
        )
    ).all()

    for e in later:
        e.position -= 1

    audit(
        db,
        user,
        "EXCLUSÃO",
        "schedule",
        entry_id,
        request,
    )

    db.commit()

    return {
        "ok": True
    }


@app.post("/schedule/entries/{entry_id}/move")
def move_schedule_entry(
    entry_id: int,
    body: MoveEntryBody,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):

    require(
        "schedule",
        write=True,
    )(user)

    company = get_current_company(
        user,
        db,
    )

    entry = db.scalar(
        select(ScheduleEntry).where(
            ScheduleEntry.id
            == entry_id,
            ScheduleEntry.company_id
            == company.id,
        )
    )

    if not entry:
        raise HTTPException(
            404,
            "Cliente não encontrado",
        )

    direction = (
        body.direction
        or ""
    ).lower()

    if direction not in (
        "up",
        "down",
    ):
        raise HTTPException(
            400,
            "direction deve ser 'up' ou 'down'",
        )

    new_pos = (
        entry.position - 1
        if direction == "up"
        else entry.position + 1
    )

    if new_pos < 1:
        raise HTTPException(
            400,
            "Já está na primeira posição",
        )

    other = db.scalar(
        select(ScheduleEntry).where(
            ScheduleEntry.route_slot_id
            == entry.route_slot_id,
            ScheduleEntry.company_id
            == company.id,
            ScheduleEntry.position
            == new_pos,
        )
    )

    if not other:
        raise HTTPException(
            400,
            "Não há cliente nessa posição",
        )

    entry.position, other.position = (
        other.position,
        entry.position,
    )

    audit(
        db,
        user,
        "REORDENAÇÃO",
        "schedule",
        entry_id,
        request,
    )

    db.commit()

    return {
        "ok": True
    }


@app.post("/schedule/entries/reorder")
def reorder_schedule_entries(
    body: ReorderEntriesBody,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):

    require(
        "schedule",
        write=True,
    )(user)

    if not body.ordered_ids:
        raise HTTPException(
            400,
            "Lista de ordenação vazia",
        )

    company = get_current_company(
        user,
        db,
    )

    rs = db.scalar(
        select(RouteSlot).where(
            RouteSlot.id
            == body.route_slot_id,
            RouteSlot.company_id
            == company.id,
        )
    )

    if not rs:
        raise HTTPException(
            404,
            "Rota não encontrada",
        )

    entries = db.scalars(
        select(ScheduleEntry).where(
            ScheduleEntry.route_slot_id
            == body.route_slot_id,
            ScheduleEntry.company_id
            == company.id,
        )
    ).all()

    by_id = {
        e.id: e
        for e in entries
    }

    if set(body.ordered_ids) != set(
        by_id.keys()
    ):
        raise HTTPException(
            400,
            "A lista de IDs não confere com os clientes desta rota",
        )

    for index, entry_id in enumerate(
        body.ordered_ids,
        start=1,
    ):
        by_id[
            entry_id
        ].position = index

    audit(
        db,
        user,
        "REORDENAÇÃO",
        "schedule",
        body.route_slot_id,
        request,
    )

    db.commit()

    return {
        "ok": True
    }


@app.post("/schedule/entries/{entry_id}/transfer")
def transfer_schedule_entry(
    entry_id: int,
    body: TransferEntryBody,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):

    require(
        "schedule",
        write=True,
    )(user)

    company = get_current_company(
        user,
        db,
    )

    entry = db.scalar(
        select(ScheduleEntry).where(
            ScheduleEntry.id
            == entry_id,
            ScheduleEntry.company_id
            == company.id,
        )
    )

    if not entry:
        raise HTTPException(
            404,
            "Cliente não encontrado",
        )

    target = db.scalar(
        select(RouteSlot).where(
            RouteSlot.id
            == body.target_route_slot_id,
            RouteSlot.company_id
            == company.id,
        )
    )

    if not target:
        raise HTTPException(
            404,
            "Rota de destino não encontrada",
        )

    if target.closed:
        raise HTTPException(
            409,
            "A rota de destino está fechada",
        )

    if entry.route_slot_id == target.id:
        raise HTTPException(
            400,
            "O cliente já está nesta rota",
        )

    slots_needed = (
        entry.slots_consumed
        or calcular_vagas(
            entry.service_description
        )
    )

    dest_entries = db.scalars(
        select(ScheduleEntry).where(
            ScheduleEntry.route_slot_id
            == target.id,
            ScheduleEntry.company_id
            == company.id,
        )
    ).all()

    used = sum(
        (
            e.slots_consumed
            or calcular_vagas(
                e.service_description
            )
        )
        for e in dest_entries
    )

    if (
        target.total_slots
        and used + slots_needed
        > target.total_slots
    ):
        raise HTTPException(
            409,
            "Não há vagas suficientes na rota de destino",
        )

    old_slot_id = (
        entry.route_slot_id
    )

    old_pos = entry.position

    entry.route_slot_id = target.id
    entry.position = (
        len(dest_entries) + 1
    )

    db.flush()

    later = db.scalars(
        select(ScheduleEntry).where(
            ScheduleEntry.route_slot_id
            == old_slot_id,
            ScheduleEntry.company_id
            == company.id,
            ScheduleEntry.position
            > old_pos,
        )
    ).all()

    for e in later:
        e.position -= 1

    audit(
        db,
        user,
        "TRANSFERÊNCIA_CLIENTE",
        "schedule",
        entry_id,
        request,
    )

    db.commit()

    return serialize_entry(
        entry,
        db,
    )


# ============================================================
# TRANSFERIR ROTA
# ============================================================

@app.post("/schedule/route-slots/{slot_id}/transfer")
def transfer_route_slot(
    slot_id: int,
    body: TransferSlotBody,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):

    require(
        "schedule",
        write=True,
    )(user)

    company = get_current_company(
        user,
        db,
    )

    rs = db.scalar(
        select(RouteSlot).where(
            RouteSlot.id == slot_id,
            RouteSlot.company_id
            == company.id,
        )
    )

    if not rs:
        raise HTTPException(
            404,
            "Rota não encontrada",
        )

    target_week_id = (
        body.week_id
        if body.week_id is not None
        else rs.week_id
    )

    week = db.scalar(
        select(ScheduleWeek).where(
            ScheduleWeek.id
            == target_week_id,
            ScheduleWeek.company_id
            == company.id,
        )
    )

    if not week:
        raise HTTPException(
            404,
            "Semana de destino não encontrada",
        )

    if week.status != WeekStatus.ATIVA:
        raise HTTPException(
            409,
            "Não é possível transferir para semana arquivada",
        )

    rs.date = body.new_date
    rs.week_id = target_week_id

    audit(
        db,
        user,
        "TRANSFERÊNCIA_ROTA",
        "schedule",
        slot_id,
        request,
    )

    db.commit()

    return serialize_route_slot(
        rs,
        db,
    )


# ============================================================
# EXTRAS
# ============================================================

@app.post("/schedule/extras")
def create_schedule_extra(
    body: ScheduleExtraCreate,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):

    require(
        "schedule",
        write=True,
    )(user)

    company = get_current_company(
        user,
        db,
    )

    entry = db.scalar(
        select(ScheduleEntry).where(
            ScheduleEntry.id
            == body.entry_id,
            ScheduleEntry.company_id
            == company.id,
        )
    )

    if not entry:
        raise HTTPException(
            404,
            "Cliente não encontrado",
        )

    extra = ScheduleExtra(
        company_id=company.id,
        entry_id=entry.id,
        description=body.description,
        observation=body.observation,
        status=body.status,
    )

    db.add(extra)
    db.flush()

    audit(
        db,
        user,
        "CADASTRO",
        "schedule",
        extra.id,
        request,
    )

    db.commit()

    return serialize_extra(
        extra
    )


@app.delete("/schedule/extras/{extra_id}")
def delete_schedule_extra(
    extra_id: int,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):

    require(
        "schedule",
        write=True,
    )(user)

    company = get_current_company(
        user,
        db,
    )

    extra = db.scalar(
        select(ScheduleExtra).where(
            ScheduleExtra.id == extra_id,
            ScheduleExtra.company_id
            == company.id,
        )
    )

    if not extra:
        raise HTTPException(
            404,
            "Item não encontrado",
        )

    db.delete(extra)

    audit(
        db,
        user,
        "EXCLUSÃO",
        "schedule",
        extra_id,
        request,
    )

    db.commit()

    return {
        "ok": True
    }


# ============================================================
# EXPORTAR ROTA
# ============================================================

@app.get("/schedule/route-slots/{slot_id}/export")
def export_route_slot(
    slot_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):

    require("schedule")(user)

    company = get_current_company(
        user,
        db,
    )

    rs = db.scalar(
        select(RouteSlot).where(
            RouteSlot.id == slot_id,
            RouteSlot.company_id
            == company.id,
        )
    )

    if not rs:
        raise HTTPException(
            404,
            "Rota não encontrada",
        )

    entries = db.scalars(
        select(ScheduleEntry)
        .where(
            ScheduleEntry.route_slot_id
            == rs.id,
            ScheduleEntry.company_id
            == company.id,
        )
        .order_by(
            ScheduleEntry.position
        )
    ).all()

    lines = []

    for e in entries:

        lines.append(
            f"*{e.position:02d}°* - {e.client_name.upper()}"
        )

        if e.location_link:
            lines.append(
                f"localização: {e.location_link}"
            )

        if e.phone:
            lines.append(
                f"tel: {e.phone}"
            )

        if e.observation:
            lines.append(
                f"*obs: {e.observation}*"
            )

        extras = db.scalars(
            select(ScheduleExtra)
            .where(
                ScheduleExtra.entry_id
                == e.id,
                ScheduleExtra.company_id
                == company.id,
            )
        ).all()

        for extra in extras:
            lines.append(
                f"+ {extra.description}"
            )

        lines.append("")

    text = "\n".join(
        lines
    ).strip()

    return Response(
        content=text,
        media_type="text/plain; charset=utf-8",
    )


# ============================================================
# ADMIN / CRÍTICO
# ============================================================

class CriticalBody(BaseModel):
    password: str = Field(
        min_length=1
    )

    confirm_text: str | None = None


def _assert_critical(
    user: User,
    body: CriticalBody,
    expected_confirm: str | None = None,
):

    if user.role != Role.ADMIN:
        raise HTTPException(
            403,
            "Apenas administradores podem executar esta ação.",
        )

    if not verify_password(
        body.password,
        user.password_hash,
    ):
        raise HTTPException(
            401,
            "Senha incorreta",
        )

    if (
        expected_confirm
        and (
            body.confirm_text or ""
        ).strip()
        != expected_confirm
    ):
        raise HTTPException(
            400,
            f"Digite exatamente: {expected_confirm}",
        )


def block_payload(
    u: User,
) -> dict | None:

    if u.active and not u.block_type:
        return None

    if (
        u.block_type == "scheduled"
        and u.blocked_until
    ):

        until = u.blocked_until

        if until.tzinfo is None:
            until = until.replace(
                tzinfo=timezone.utc
            )

        now = datetime.now(
            timezone.utc
        )

        if now >= until:

            u.active = True
            u.block_type = None
            u.blocked_until = None
            u.block_reason = None

            return None

    until_iso = None

    if u.blocked_until:

        until = u.blocked_until

        if until.tzinfo is None:
            until = until.replace(
                tzinfo=timezone.utc
            )

        until_iso = until.isoformat()

    return {
        "blocked": True,
        "block_type": (
            u.block_type
            or "manual"
        ),
        "blocked_until": until_iso,
        "reason": u.block_reason,
    }


@app.get("/admin/backup/export")
def backup_export(
    user: User = Depends(company_admin),
    db: Session = Depends(get_db),
):

    company = get_current_company(
        user,
        db,
    )

    tables = {
        "customers": Customer,
        "vehicles": Vehicle,
        "drivers": Driver,
        "routes": Route,
        "route_stops": RouteStop,
        "maintenance": Maintenance,
        "fuel": FuelRecord,
        "products": Product,
        "stock_movements": StockMovement,
        "schedule_weeks": ScheduleWeek,
        "route_slots": RouteSlot,
        "schedule_entries": ScheduleEntry,
        "schedule_extras": ScheduleExtra,
        "production": ProductionRecord,
        "orders": Order,
        "settings": Setting,
        "users": User,
        "audit": AuditLog,
    }

    result = {
        "exported_at":
            datetime.now(
                timezone.utc
            ).isoformat(),
        "company": serialize(
            company
        ),
        "tables": {},
    }

    for name, model in tables.items():

        if not hasattr(
            model,
            "company_id",
        ):
            continue

        rows = db.scalars(
            select(model).where(
                model.company_id
                == company.id
            )
        ).all()

        if model is User:
            result["tables"][name] = [
                serialize_user(
                    row,
                    company,
                )
                for row in rows
            ]
        else:
            result["tables"][name] = [
                serialize(row)
                for row in rows
            ]

    return result


@app.post("/admin/critical/revoke-sessions")
def critical_revoke_sessions(
    body: CriticalBody,
    request: Request,
    user: User = Depends(company_admin),
    db: Session = Depends(get_db),
):

    _assert_critical(
        user,
        body,
        "ENCERRAR SESSOES",
    )

    company = get_current_company(
        user,
        db,
    )

    rows = db.scalars(
        select(User).where(
            User.company_id
            == company.id,
            User.id != user.id,
        )
    ).all()

    for u in rows:

        u.token_version = (
            int(
                getattr(
                    u,
                    "token_version",
                    0,
                )
                or 0
            )
            + 1
        )

    audit(
        db,
        user,
        "CRITICO_REVOKE_SESSIONS",
        "admin",
        None,
        request,
    )

    db.commit()

    return {
        "ok": True,
        "detail": "Todas as sessões dos demais usuários desta empresa foram encerradas",
    }


@app.post("/admin/critical/purge-users")
def critical_purge_users(
    body: CriticalBody,
    request: Request,
    user: User = Depends(company_admin),
    db: Session = Depends(get_db),
):

    _assert_critical(
        user,
        body,
        "REMOVER USUARIOS",
    )

    company = get_current_company(
        user,
        db,
    )

    others = db.scalars(
        select(User).where(
            User.company_id
            == company.id,
            User.id != user.id,
        )
    ).all()

    for u in others:

        db.execute(
            update(AuditLog)
            .where(
                AuditLog.user_id
                == u.id,
                AuditLog.company_id
                == company.id,
            )
            .values(
                user_id=None
            )
        )

        try:

            db.delete(u)
            db.flush()

        except IntegrityError as exc:

            db.rollback()

            raise HTTPException(
                409,
                f"Não foi possível excluir {u.username}: há vínculos.",
            ) from exc

    audit(
        db,
        user,
        "CRITICO_PURGE_USERS",
        "admin",
        None,
        request,
    )

    db.commit()

    return {
        "ok": True,
        "removed": len(others),
    }


@app.post("/admin/critical/wipe-operational")
def critical_wipe_operational(
    body: CriticalBody,
    request: Request,
    user: User = Depends(company_admin),
    db: Session = Depends(get_db),
):

    _assert_critical(
        user,
        body,
        "EXCLUIR DADOS",
    )

    company = get_current_company(
        user,
        db,
    )

    # Filhos primeiro
    operational_models = (
        ScheduleExtra,
        ScheduleEntry,
        RouteSlot,
        ScheduleWeek,
        StockMovement,
        Maintenance,
        FuelRecord,
    )

    for model in operational_models:

        if hasattr(
            model,
            "company_id",
        ):

            db.execute(
                delete(model).where(
                    model.company_id
                    == company.id
                )
            )

    audit(
        db,
        user,
        "CRITICO_WIPE_OPERATIONAL",
        "admin",
        None,
        request,
    )

    db.commit()

    return {
        "ok": True,
        "detail": "Dados operacionais da empresa foram removidos",
    }


# ============================================================
# PRODUÇÃO / MONTAGEM
# ============================================================

PRODUCTION_MODELS = [
    "MONO - 7MTs",
    "TRIF - 7MTs",
    "BI+MONO - 7MTs",
    "MURETA",
    "MONO 2CXs - 7MTs",
    "3CXs - 7MTs",
    "TRIF - 8MTs",
    "BI+MONO - 8MTs",
    "2CXs - 8MTs",
    "3CXs - 8MTs",
    "DUPLO T - 7MTs",
    "DUPLO T - 8MTs",
    "DUPLO T - 8.3MTs",
    "DUPLO T - 9MTs",
    "MURETA ÁGUA",
]


class ProductionLineIn(BaseModel):
    model: str = Field(
        min_length=1,
        max_length=80,
    )

    quantity: float = Field(
        ge=0
    )

    emergency_altered: float = Field(
        default=0,
        ge=0,
    )

    # Obrigatório no backend quando emergency_altered > 0 (montagem)
    emergency_reason: str | None = None


class ProductionBatchIn(BaseModel):
    kind: str
    production_date: date
    lines: list[ProductionLineIn]
    notes: str | None = None
    # Caixas provisórias (somente montagem) — monofásica / bifásica / trifásica
    provisional_lines: list[ProductionLineIn] = []
    provisional_destination: str | None = None  # matriz_tubarao | filial_biguacu
    # compatibilidade com versão antiga (quantidade única)
    provisional_boxes: float = 0


CAIXA_PROVISORIA_PREFIX = "CAIXA PROVISÓRIA"
CAIXA_PROVISORIA_MODELS = {
    "CAIXA PROVISÓRIA MONOFÁSICA",
    "CAIXA PROVISÓRIA BIFÁSICA",
    "CAIXA PROVISÓRIA TRIFÁSICA",
    "CAIXA PROVISÓRIA",  # legado
}
PROVISIONAL_DESTINATIONS = {
    "matriz_tubarao": "Matriz — Tubarão",
    "filial_biguacu": "Filial — Biguaçu",
}


def _can_prod(
    user: User,
    need: str,
) -> bool:

    perms = set(
        p.strip()
        for p in (
            user.permissions
            or ""
        ).split(",")
        if p.strip()
    )

    grants = (
        MODULES.get(
            user.role,
            set(),
        )
        if not user.permissions
        else perms
    )

    if "*" in grants or "*" in perms:
        return True

    return (
        need in perms
        or need in grants
    )


@app.get("/production/models")
def production_models(
    user: User = Depends(current_user),
):

    if not (
        _can_prod(
            user,
            "production",
        )
        or _can_prod(
            user,
            "assembly",
        )
    ):
        raise HTTPException(
            403,
            "Sem permissão",
        )

    return list(
        PRODUCTION_MODELS
    )


@app.post("/production/batch")
def create_production_batch(
    body: ProductionBatchIn,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):

    kind = (
        body.kind or ""
    ).lower().strip()

    if kind not in (
        "fabricacao",
        "montagem",
    ):
        raise HTTPException(
            400,
            "kind inválido",
        )

    if (
        kind == "fabricacao"
        and not _can_prod(
            user,
            "production",
        )
    ):
        raise HTTPException(
            403,
            "Sem permissão de Produção",
        )

    if (
        kind == "montagem"
        and not _can_prod(
            user,
            "assembly",
        )
    ):
        raise HTTPException(
            403,
            "Sem permissão de Montagem",
        )

    prov_dest = (getattr(body, "provisional_destination", None) or "").strip().lower() or None
    prov_lines = list(getattr(body, "provisional_lines", None) or [])
    # compat: quantidade única antiga vira monofásica
    legacy_boxes = float(getattr(body, "provisional_boxes", 0) or 0)
    if legacy_boxes > 0 and not prov_lines:
        prov_lines = [
            ProductionLineIn(
                model="CAIXA PROVISÓRIA MONOFÁSICA",
                quantity=legacy_boxes,
            )
        ]
    prov_total = sum(float(l.quantity or 0) for l in prov_lines)

    has_lines = any(
        float(l.quantity or 0) > 0
        or (kind == "montagem" and float(l.emergency_altered or 0) > 0)
        for l in (body.lines or [])
    )
    if not has_lines and not (kind == "montagem" and prov_total > 0):
        raise HTTPException(
            400,
            "Informe ao menos um modelo ou caixas provisórias",
        )

    if kind == "montagem" and prov_total > 0:
        if prov_dest not in PROVISIONAL_DESTINATIONS:
            raise HTTPException(
                400,
                "Informe o destino das caixas provisórias: Matriz (Tubarão) ou Filial (Biguaçu).",
            )

    company = get_current_company(
        user,
        db,
    )

    # Segurança: montagem por modelo não pode ultrapassar a fabricação do mesmo modelo no dia
    # Ex.: fabricou 5 monofásicos → montagem monofásico no dia <= 5 (não pode 6)
    if kind == "montagem":
        # soma fabricação do dia por modelo
        fab_rows = db.execute(
            select(
                ProductionRecord.model,
                func.coalesce(func.sum(ProductionRecord.quantity), 0),
            )
            .where(
                ProductionRecord.company_id == company.id,
                ProductionRecord.production_date == body.production_date,
                ProductionRecord.kind == "fabricacao",
            )
            .group_by(ProductionRecord.model)
        ).all()
        fab_by_model = {
            str(m or "").strip(): float(q or 0) for m, q in fab_rows
        }

        # soma montagem já lançada no dia por modelo (ignora caixas provisórias)
        mont_rows = db.execute(
            select(
                ProductionRecord.model,
                func.coalesce(func.sum(ProductionRecord.quantity), 0),
            )
            .where(
                ProductionRecord.company_id == company.id,
                ProductionRecord.production_date == body.production_date,
                ProductionRecord.kind == "montagem",
                ProductionRecord.model.notin_(list(CAIXA_PROVISORIA_MODELS)),
            )
            .group_by(ProductionRecord.model)
        ).all()
        mont_by_model = {
            str(m or "").strip(): float(q or 0) for m, q in mont_rows
        }

        # quantidades deste lançamento por modelo
        new_by_model: dict[str, float] = {}
        for l in body.lines or []:
            model_name = (l.model or "").strip()
            if not model_name or model_name in CAIXA_PROVISORIA_MODELS:
                continue
            if model_name.startswith(CAIXA_PROVISORIA_PREFIX):
                continue
            qty = float(l.quantity or 0)
            if qty <= 0:
                continue
            new_by_model[model_name] = new_by_model.get(model_name, 0.0) + qty

        violations = []
        for model_name, new_qty in new_by_model.items():
            fab = fab_by_model.get(model_name, 0.0)
            already = mont_by_model.get(model_name, 0.0)
            total_after = already + new_qty
            if total_after > fab + 1e-9:
                remaining = max(0.0, fab - already)
                violations.append(
                    f"{model_name}: fabricado {fab:g}, já montado {already:g}, "
                    f"neste lançamento {new_qty:g} (máx. restante {remaining:g})"
                )

        if violations:
            raise HTTPException(
                400,
                (
                    "Montagem por modelo não pode ultrapassar a fabricação do mesmo modelo no dia. "
                    + " | ".join(violations)
                ),
            )

    created = []

    for line in body.lines or []:

        qty = float(
            line.quantity or 0
        )

        em = (
            float(
                line.emergency_altered
                or 0
            )
            if kind == "montagem"
            else 0.0
        )

        if qty <= 0 and em <= 0:
            continue

        model_name = line.model.strip()
        if model_name in CAIXA_PROVISORIA_MODELS or model_name.startswith(CAIXA_PROVISORIA_PREFIX):
            continue  # tratado abaixo

        emerg_reason = (getattr(line, "emergency_reason", None) or "").strip()
        if kind == "montagem" and em > 0 and not emerg_reason:
            raise HTTPException(
                400,
                f'Informe o motivo da alteração de emergência do modelo "{model_name}".',
            )

        line_notes = body.notes
        if kind == "montagem" and em > 0 and emerg_reason:
            line_notes = (
                f"EMERG:{emerg_reason}"
                + (f" | {body.notes}" if body.notes else "")
            )

        rec = ProductionRecord(
            company_id=company.id,
            kind=kind,
            production_date=body.production_date,
            model=model_name,
            quantity=qty,
            emergency_altered=em,
            notes=line_notes,
            user_id=user.id,
        )

        db.add(rec)
        db.flush()

        created.append(
            serialize(rec)
        )

    if kind == "montagem" and prov_total > 0:
        for pl in prov_lines:
            pq = float(pl.quantity or 0)
            if pq <= 0:
                continue
            model_name = (pl.model or "").strip().upper()
            if not model_name.startswith(CAIXA_PROVISORIA_PREFIX):
                # normaliza nomes curtos
                mapping = {
                    "MONOFASICA": "CAIXA PROVISÓRIA MONOFÁSICA",
                    "MONOFÁSICA": "CAIXA PROVISÓRIA MONOFÁSICA",
                    "BIFASICA": "CAIXA PROVISÓRIA BIFÁSICA",
                    "BIFÁSICA": "CAIXA PROVISÓRIA BIFÁSICA",
                    "TRIFASICA": "CAIXA PROVISÓRIA TRIFÁSICA",
                    "TRIFÁSICA": "CAIXA PROVISÓRIA TRIFÁSICA",
                }
                model_name = mapping.get(model_name, f"CAIXA PROVISÓRIA {model_name}")
            rec = ProductionRecord(
                company_id=company.id,
                kind="montagem",
                production_date=body.production_date,
                model=model_name,
                quantity=pq,
                emergency_altered=0,
                notes=(
                    f"{body.notes} | DEST:{prov_dest}"
                    if body.notes
                    else f"DEST:{prov_dest}"
                ),
                user_id=user.id,
            )
            db.add(rec)
            db.flush()
            created.append(serialize(rec))

    if not created:
        raise HTTPException(
            400,
            "Nenhuma quantidade informada",
        )

    audit(
        db,
        user,
        "PRODUCAO_LOTE",
        "production",
        None,
        request,
    )

    db.commit()

    return {
        "ok": True,
        "count": len(created),
        "records": created,
    }


@app.get("/production/by-day")
def production_by_day(
    date_from: date | None = None,
    date_to: date | None = None,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):

    allow_fab = _can_prod(
        user,
        "production",
    )

    allow_mnt = _can_prod(
        user,
        "assembly",
    )

    if not allow_fab and not allow_mnt:
        raise HTTPException(
            403,
            "Sem permissão",
        )

    company = get_current_company(
        user,
        db,
    )

    q = (
        select(ProductionRecord)
        .where(
            ProductionRecord.company_id
            == company.id
        )
        .order_by(
            ProductionRecord.production_date.desc(),
            ProductionRecord.kind,
            ProductionRecord.model,
        )
    )

    if date_from:
        q = q.where(
            ProductionRecord.production_date
            >= date_from
        )

    if date_to:
        q = q.where(
            ProductionRecord.production_date
            <= date_to
        )

    rows = db.scalars(
        q.limit(3000)
    ).all()

    days: dict[str, dict] = {}

    for r in rows:

        if (
            r.kind == "fabricacao"
            and not allow_fab
        ):
            continue

        if (
            r.kind == "montagem"
            and not allow_mnt
        ):
            continue

        key = (
            r.production_date.isoformat()
            if r.production_date
            else ""
        )

        if key not in days:

            days[key] = {
                "date": key,
                "fabricacao": [],
                "montagem": [],
                "fabricacao_total": 0.0,
                "montagem_total": 0.0,
                "emergency_total": 0.0,
                "provisional_boxes": 0.0,
                "provisional_destination": None,
                "provisional_destination_label": None,
            }

        notes_raw = r.notes or ""
        emerg_reason = None
        if "EMERG:" in notes_raw:
            emerg_reason = notes_raw.split("EMERG:", 1)[-1].split("|", 1)[0].strip()
        item = {
            "id": r.id,
            "model": r.model,
            "quantity": float(
                r.quantity or 0
            ),
            "emergency_altered": float(
                r.emergency_altered or 0
            ),
            "emergency_reason": emerg_reason,
            "user_id": r.user_id,
            "notes": r.notes,
        }

        if r.kind == "fabricacao":

            days[key][
                "fabricacao"
            ].append(item)

            days[key][
                "fabricacao_total"
            ] += item["quantity"]

        else:
            # Caixa provisória (mono/bi/tri): não conta como poste montado
            model_name = (r.model or "").strip()
            if (
                model_name in CAIXA_PROVISORIA_MODELS
                or model_name.startswith(CAIXA_PROVISORIA_PREFIX)
            ):
                days[key]["provisional_boxes"] += item["quantity"]
                notes = r.notes or ""
                dest = None
                if "DEST:" in notes:
                    dest = notes.split("DEST:")[-1].strip().split()[0].strip()
                if dest in PROVISIONAL_DESTINATIONS:
                    days[key]["provisional_destination"] = dest
                    days[key]["provisional_destination_label"] = PROVISIONAL_DESTINATIONS[dest]
                days[key]["montagem"].append({
                    **item,
                    "is_provisional": True,
                    "destination": dest,
                    "destination_label": PROVISIONAL_DESTINATIONS.get(dest) if dest else None,
                })
            else:
                days[key]["montagem"].append(item)
                days[key]["montagem_total"] += item["quantity"]
                days[key]["emergency_total"] += item["emergency_altered"]

    return sorted(
        days.values(),
        key=lambda x: x["date"],
        reverse=True,
    )


@app.get("/production/export")
def export_production(
    date_from: date | None = None,
    date_to: date | None = None,
    kind: str | None = None,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):

    if not (
        _can_prod(
            user,
            "production",
        )
        or _can_prod(
            user,
            "assembly",
        )
    ):
        raise HTTPException(
            403,
            "Sem permissão",
        )

    company = get_current_company(
        user,
        db,
    )

    q = (
        select(ProductionRecord)
        .where(
            ProductionRecord.company_id
            == company.id
        )
        .order_by(
            ProductionRecord.production_date,
            ProductionRecord.kind,
            ProductionRecord.model,
        )
    )

    if date_from:
        q = q.where(
            ProductionRecord.production_date
            >= date_from
        )

    if date_to:
        q = q.where(
            ProductionRecord.production_date
            <= date_to
        )

    if kind in (
        "fabricacao",
        "montagem",
    ):
        q = q.where(
            ProductionRecord.kind
            == kind
        )

    rows = db.scalars(q).all()

    return {
        "exported_at":
            datetime.now(
                timezone.utc
            ).isoformat(),

        "date_from":
            date_from.isoformat()
            if date_from
            else None,

        "date_to":
            date_to.isoformat()
            if date_to
            else None,

        "count": len(rows),

        "records": [
            serialize(r)
            for r in rows
        ],
    }


class ProductionPurgeBody(BaseModel):
    password: str
    date_from: date | None = None
    date_to: date | None = None
    confirm_text: str


@app.post("/production/purge")
def purge_production(
    body: ProductionPurgeBody,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    role_val = (
        user.role.value
        if hasattr(user.role, "value")
        else str(user.role or "")
    ).strip().upper()
    allowed_roles = {
        "ADMINISTRADOR",
        "GERENTE",
        "ADMIN",
        "MANAGER",
    }
    if (
        role_val not in allowed_roles
        and not getattr(user, "is_owner", False)
        and not getattr(user, "is_main_admin", False)
    ):
        raise HTTPException(
            403,
            "Apenas administrador ou gerente podem apagar o dia",
        )

    if (
        body.confirm_text
        .strip()
        .upper()
        .replace("Ç", "C")
        .replace("ç", "C")
        != "APAGAR PRODUCAO"
    ):
        raise HTTPException(
            400,
            "Digite APAGAR PRODUCAO para confirmar",
        )

    pwd = (body.password or "").strip()
    if not pwd or not verify_password(pwd, user.password_hash):
        raise HTTPException(
            403,
            "Senha incorreta",
        )

    company = get_current_company(
        user,
        db,
    )

    q = select(
        ProductionRecord
    ).where(
        ProductionRecord.company_id
        == company.id
    )

    if body.date_from:
        q = q.where(
            ProductionRecord.production_date
            >= body.date_from
        )

    if body.date_to:
        q = q.where(
            ProductionRecord.production_date
            <= body.date_to
        )

    rows = db.scalars(
        q
    ).all()

    n = len(rows)

    for r in rows:
        db.delete(r)

    audit(
        db,
        user,
        "PRODUCAO_PURGE",
        "production",
        None,
        request,
        details=f"Apagados {n} registros",
    )

    db.commit()

    return {
        "ok": True,
        "deleted": n,
    }


# ============================================================
# ESQUECI MINHA SENHA
# ============================================================

class ForgotPasswordBody(BaseModel):
    username: str = Field(
        min_length=1,
        max_length=60,
    )

    email: str = Field(
        min_length=5,
        max_length=160,
    )


class ResetPasswordBody(BaseModel):
    token: str = Field(
        min_length=20,
        max_length=200,
    )

    new_password: str = Field(
        min_length=3,
        max_length=200,
    )


def _hash_token(
    token: str,
) -> str:

    return hashlib.sha256(
        token.encode("utf-8")
    ).hexdigest()


def _send_reset_email(
    to_email: str,
    reset_link: str,
) -> bool:

    host = os.environ.get(
        "SMTP_HOST"
    )

    user = os.environ.get(
        "SMTP_USER"
    )

    password = os.environ.get(
        "SMTP_PASSWORD"
    )

    port = int(
        os.environ.get(
            "SMTP_PORT"
        )
        or 587
    )

    from_addr = (
        os.environ.get(
            "SMTP_FROM"
        )
        or user
    )

    if not host or not user or not password or not from_addr:
        return False

    front = (
        os.environ.get(
            "FRONTEND_URL"
        )
        or "https://logisticasbill.vercel.app"
    ).rstrip("/")

    logo_url = (
        f"{front}/icon2.png"
    )

    text = (
        "LOGÍSTICAS BILL — Redefinição de senha\n\n"
        "Recebemos um pedido para redefinir a senha da sua conta.\n"
        "Abra o link abaixo (válido por 1 hora):\n"
        f"{reset_link}\n\n"
        "Se você não solicitou, ignore este e-mail.\n"
    )

    html = f"""
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
</head>

<body style="margin:0;padding:0;background:#f4f7fb;font-family:Arial,Helvetica,sans-serif;color:#16253a;">

<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7fb;padding:24px 12px;">
<tr>
<td align="center">

<table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;">

<tr>
<td style="background:#0f2846;padding:20px 24px;text-align:center;">

<img
src="{logo_url}"
alt="Logísticas Bill"
width="56"
height="56"
style="display:inline-block;border:0;"
/>

<div style="color:#ffffff;font-size:18px;font-weight:bold;margin-top:10px;">
LOGÍSTICAS BILL
</div>

</td>
</tr>

<tr>
<td style="padding:28px 24px;">

<h1 style="margin:0 0 12px;font-size:20px;color:#0f2846;">
Redefinição de senha
</h1>

<p style="font-size:14px;line-height:1.5;color:#475569;">
Recebemos um pedido para redefinir a senha da sua conta no sistema.
Clique no botão abaixo. Este link é
<strong>válido por 1 hora</strong>.
</p>

<p style="text-align:center;margin:28px 0;">

<a
href="{reset_link}"
style="display:inline-block;background:#0e7490;color:#ffffff;text-decoration:none;font-size:14px;font-weight:bold;padding:12px 28px;border-radius:8px;"
>
Redefinir minha senha
</a>

</p>

<p style="font-size:12px;color:#64748b;line-height:1.4;">

Se o botão não funcionar, copie e cole no navegador:

<br/>

<a
href="{reset_link}"
style="color:#0e7490;word-break:break-all;"
>
{reset_link}
</a>

</p>

<p style="font-size:12px;color:#94a3b8;">
Se você não solicitou esta alteração, ignore este e-mail.
</p>

</td>
</tr>

<tr>
<td style="background:#f8fafc;padding:14px 24px;text-align:center;font-size:11px;color:#94a3b8;">
© Logísticas Bill — sistema interno
</td>
</tr>

</table>

</td>
</tr>
</table>

</body>
</html>
"""

    msg = EmailMessage()

    msg["Subject"] = (
        "Logísticas Bill — redefinir senha"
    )

    msg["From"] = from_addr
    msg["To"] = to_email

    msg.set_content(text)

    msg.add_alternative(
        html,
        subtype="html",
    )

    try:

        with smtplib.SMTP(
            host,
            port,
            timeout=20,
        ) as s:

            s.starttls()

            s.login(
                user,
                password,
            )

            s.send_message(msg)

        return True

    except Exception:

        return False


@app.post("/auth/forgot-password")
@limiter.limit("5/minute")
def forgot_password(
    body: ForgotPasswordBody,
    request: Request,
    db: Session = Depends(get_db),
):

    username = (
        body.username
        .strip()
        .lower()
    )

    email = (
        body.email
        .strip()
        .lower()
    )

    u = db.scalar(
        select(User).where(
            func.lower(
                User.username
            ) == username
        )
    )

    if (
        u
        and (
            u.email or ""
        ).strip().lower()
        == email
        and u.active
    ):

        for old in db.scalars(
            select(
                PasswordResetToken
            ).where(
                PasswordResetToken.user_id
                == u.id,
                PasswordResetToken.used_at.is_(
                    None
                ),
            )
        ).all():

            old.used_at = datetime.now(
                timezone.utc
            )

        raw = secrets.token_urlsafe(
            32
        )

        db.add(
            PasswordResetToken(
                user_id=u.id,
                token_hash=_hash_token(
                    raw
                ),
                expires_at=(
                    datetime.now(
                        timezone.utc
                    )
                    + timedelta(hours=1)
                ),
            )
        )

        front = (
            os.environ.get(
                "FRONTEND_URL"
            )
            or "https://logisticasbill.vercel.app"
        ).rstrip("/")

        link = (
            f"{front}/?reset_token={raw}"
        )

        sent = _send_reset_email(
            email,
            link,
        )

        audit(
            db,
            u,
            "FORGOT_PASSWORD",
            "auth",
            request=request,
            details=(
                "E-mail enviado"
                if sent
                else "Token gerado (SMTP ausente ou falhou)"
            ),
        )

        db.commit()

    else:

        audit(
            db,
            None,
            "FORGOT_PASSWORD_FAIL",
            "auth",
            request=request,
            details="Usuário/e-mail não conferem",
            username_attempted=username[:120],
        )

        db.commit()

    return {
        "ok": True,
        "detail": (
            "Se os dados estiverem corretos, "
            "você receberá um e-mail com o link em alguns minutos."
        ),
    }


@app.post("/auth/reset-password")
@limiter.limit("10/minute")
def reset_password(
    body: ResetPasswordBody,
    request: Request,
    db: Session = Depends(get_db),
):

    th = _hash_token(
        body.token.strip()
    )

    row = db.scalar(
        select(
            PasswordResetToken
        ).where(
            PasswordResetToken.token_hash
            == th
        )
    )

    if not row or row.used_at is not None:
        raise HTTPException(
            400,
            "Link inválido ou já usado",
        )

    exp = row.expires_at

    if exp is None:
        raise HTTPException(
            400,
            "Link inválido",
        )

    if exp.tzinfo is None:
        exp = exp.replace(
            tzinfo=timezone.utc
        )
    else:
        exp = exp.astimezone(
            timezone.utc
        )

    if (
        datetime.now(timezone.utc)
        >= exp
    ):
        raise HTTPException(
            400,
            "Link expirado. Solicite a redefinição novamente.",
        )

    u = db.scalar(
        select(User).where(
            User.id == row.user_id
        )
    )

    if not u or not u.active:
        raise HTTPException(
            400,
            "Usuário indisponível",
        )

    u.password_hash = hash_password(
        body.new_password
    )

    u.must_change_password = False

    u.token_version = (
        int(
            getattr(
                u,
                "token_version",
                0,
            )
            or 0
        )
        + 1
    )

    row.used_at = datetime.now(
        timezone.utc
    )

    audit(
        db,
        u,
        "RESET_PASSWORD",
        "auth",
        request=request,
    )

    db.commit()

    return {
        "ok": True,
        "detail": "Senha alterada. Faça login.",
    }