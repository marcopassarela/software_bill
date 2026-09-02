import re
from datetime import datetime, date, timedelta, timezone
from typing import Any
from fastapi import Depends, FastAPI, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, select, update
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
    main_admin,
    require,
    token_for,
    verify_password,
    MODULES,
    apply_auto_unblock,
    block_detail,
    clear_block,
)
import hashlib
import os
import secrets
import smtplib
from email.message import EmailMessage

app = FastAPI(title="Gestão Logística API", version="1.0.0")
settings = get_settings()
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(
    RateLimitExceeded,
    lambda r, e: Response(
        '{"detail":"Muitas tentativas. Aguarde."}',
        429,
        media_type="application/json",
    ),
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    return JSONResponse(status_code=500, content={"detail": f"Erro interno: {exc}"})


def update_maintenance_status(db: Session):
    """Atualiza automaticamente manutenções cuja data já chegou para 'Em andamento'."""
    today = date.today()
    db.execute(
        update(Maintenance)
        .where(
            Maintenance.status == "Agendado",
            func.date(Maintenance.date) <= today,
        )
        .values(status="Em andamento")
    )
    db.commit()


@app.on_event("startup")
def seed():
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        update_maintenance_status(db)


class Login(BaseModel):
    username: str
    password: str
    latitude: float | None = None
    longitude: float | None = None


class PasswordChange(BaseModel):
    current_password: str = Field(min_length=1, max_length=200)
    new_password: str = Field(min_length=3, max_length=200)


class ProfileUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=120)

class UserCreate(BaseModel):
    name: str
    username: str
    email: str = Field(min_length=5, max_length=160)
    password: str = Field(min_length=1)
    role: Role
    permissions: str | None = None


class Payload(BaseModel):
    data: dict[str, Any]

class CommercialProductBody(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    price: float = Field(ge=0)
    code: str | None = Field(default=None, max_length=60)
    unit: str | None = Field(default="UN", max_length=20)
    category: str | None = Field(default=None, max_length=80)
    notes: str | None = None
    active: bool = True

# ============================================================
# PRODUÇÃO / MONTAGEM
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

from datetime import datetime, timezone

def user_is_blocked(u: User, db: Session) -> bool:
    """True se o usuário não pode usar o sistema agora."""

    if not u.active:
        # Bloqueio agendado que já terminou
        if u.block_type == "scheduled" and u.blocked_until:
            now = datetime.now(timezone.utc)
            until = u.blocked_until
            if until.tzinfo is None:
                until = until.replace(tzinfo=timezone.utc)
            if now >= until:
                clear_block(u)
                db.commit()
                return False
        # Bloqueio permanente/manual ou agendado ainda ativo
        return True

    return False





def serialize(o):
    d = {c.name: getattr(o, c.name) for c in o.__table__.columns}
    return {
        k: (
            v.value
            if hasattr(v, "value")
            else v.isoformat()
            if isinstance(v, datetime)
            else float(v)
            if hasattr(v, "as_tuple")
            else v
        )
        for k, v in d.items()
    }


def serialize_user(o):
    d = serialize(o)
    d.pop("password_hash", None)
    # avatar pode ser grande; front usa avatar_data se existir
    d["is_main_admin"] = o.id == 1
    d["has_avatar"] = bool(getattr(o, "avatar_data", None))
    return d


def model_data(model, data):
    return {
        c.name: v
        for c in model.__table__.columns
        for k, v in data.items()
        if k == c.name and k not in {"id", "quantity", "created_at", "occurred_at"}
    }


def normalize_cpf(value: Any) -> str | None:
    """CPF opcional: vazio -> None; se preenchido, exige 11 dígitos."""
    if value is None:
        return None
    digits = "".join(c for c in str(value) if c.isdigit())
    if not digits:
        return None
    if len(digits) != 11:
        raise HTTPException(422, "CPF deve ter 11 dígitos")
    return digits





@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/auth/login")
@limiter.limit("5/minute")
def login(
    body: Login,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    u = db.scalar(select(User).where(User.username == body.username))
    if not u:
        audit(
            db,
            None,
            "LOGIN_INVÁLIDO",
            "auth",
            request=request,
            details="Tentativa de login inválida: Usuário inexistente",
            username_attempted=(body.username or "").strip()[:120],
            latitude=getattr(body, "latitude", None),
            longitude=getattr(body, "longitude", None),
        )
        db.commit()
        raise HTTPException(401, "Usuário ou senha inválidos")

    if not verify_password(body.password, u.password_hash):
        audit(
            db,
            u,
            "LOGIN_INVÁLIDO",
            "auth",
            request=request,
            details="Tentativa de login inválida: Senha inválida",
            username_attempted=body.username.strip()[:120],
            latitude=getattr(body, "latitude", None),
            longitude=getattr(body, "longitude", None),
        )
        db.commit()
        raise HTTPException(401, "Usuário ou senha inválidos")


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
            latitude=getattr(body, "latitude", None),
            longitude=getattr(body, "longitude", None),
        )
        db.commit()
        raise HTTPException(status_code=403, detail=block_detail(u))

    audit(
        db,
        u,
        "LOGIN",
        "auth",
        request=request,
        details="Login realizado com sucesso",
        username_attempted=u.username,
        latitude=getattr(body, "latitude", None),
        longitude=getattr(body, "longitude", None),
    )
    db.commit()
    response.set_cookie(
        "gl_session",
        token_for(u),
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        max_age=settings.access_token_minutes * 60,
        path="/",
    )
    return {"user": serialize_user(u)}


@app.post("/auth/logout")
def logout(
    response: Response,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    audit(db, user, "LOGOUT", "auth", request=request)
    db.commit()
    response.delete_cookie("gl_session", path="/")
    return {"ok": True}


@app.get("/auth/me")
def me(user: User = Depends(current_user)):
    return serialize_user(user)


@app.post("/auth/change-password")
def change_password(
    body: PasswordChange,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(400, "Senha atual incorreta")
    user.password_hash = hash_password(body.new_password)
    user.must_change_password = False
    audit(db, user, "ALTERAÇÃO_DE_SENHA", "auth", user.id, request)
    db.commit()
    return {"ok": True}


@app.patch("/auth/profile")
def update_profile(
    body: ProfileUpdate,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    user.name = body.name
    audit(db, user, "ALTERAÇÃO_DE_PERFIL", "auth", user.id, request)
    db.commit()
    return serialize_user(user)


class AvatarBody(BaseModel):
    avatar_data: str  # data:image/jpeg;base64,...


@app.post("/auth/avatar")
def upload_avatar(
    body: AvatarBody,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    raw = (body.avatar_data or "").strip()
    if not raw.startswith("data:image/"):
        raise HTTPException(400, "Envie uma imagem (JPEG ou PNG)")
    # ~150 KB em base64
    if len(raw) > 200_000:
        raise HTTPException(400, "Imagem muito grande. Use uma foto leve (até ~150 KB).")
    u = db.get(User, user.id)
    if not u:
        raise HTTPException(404)
    u.avatar_data = raw
    audit(db, u, "AVATAR", "auth", u.id, request)
    db.commit()
    return serialize_user(u)


@app.delete("/auth/avatar")
def delete_avatar(
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    u = db.get(User, user.id)
    if not u:
        raise HTTPException(404)
    u.avatar_data = None
    audit(db, u, "AVATAR_REMOVE", "auth", u.id, request)
    db.commit()
    return serialize_user(u)


@app.get("/users")
def users(_: User = Depends(main_admin), db: Session = Depends(get_db)):
    return [serialize_user(x) for x in db.scalars(select(User).order_by(User.name)).all()]


@app.post("/users")
def create_user(
    body: UserCreate,
    request: Request,
    admin: User = Depends(main_admin),
    db: Session = Depends(get_db),
):
    email = (body.email or "").strip().lower()
    if "@" not in email:
        raise HTTPException(422, "E-mail inválido")
    u = User(
        name=body.name,
        username=body.username,
        email=email,
        password_hash=hash_password(body.password),
        role=body.role,
        permissions=body.permissions,
        must_change_password=True,
    )
    db.add(u)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Usuário já existe")
    audit(db, admin, "CRIAÇÃO_DE_USUÁRIO", "users", u.id, request)
    db.commit()
    return serialize_user(u)


@app.patch("/users/{user_id}")
def update_user(
    user_id: int,
    body: Payload,
    request: Request,
    admin: User = Depends(main_admin),
    db: Session = Depends(get_db),
):
    u = db.get(User, user_id)
    if not u:
        raise HTTPException(404, "Usuário não encontrado")
    if "email" in body.data and body.data["email"] is not None:
        body.data["email"] = str(body.data["email"]).strip().lower()
    for k in ("name", "username", "email", "role", "active", "permissions"):
        if k in body.data:
            setattr(u, k, body.data[k])
    if body.data.get("password"):
        pwd = body.data["password"]
        if len(pwd) < 3:
            raise HTTPException(422, "A nova senha deve ter pelo menos 3 caracteres")
        u.password_hash = hash_password(pwd)
        u.must_change_password = True
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Nome de usuário já em uso")
    audit(db, admin, "ALTERAÇÃO_DE_USUÁRIO", "users", u.id, request)
    db.commit()
    return serialize_user(u)


@app.delete("/users/{user_id}")
def delete_user(
    user_id: int,
    request: Request,
    admin: User = Depends(main_admin),
    db: Session = Depends(get_db),
):
    u = db.get(User, user_id)
    if not u:
        raise HTTPException(404, "Usuário não encontrado")
    if u.id == 1:
        raise HTTPException(400, "Não é possível excluir o Administrador Principal")
    db.execute(update(AuditLog).where(AuditLog.user_id == user_id).values(user_id=None))
    try:
        db.delete(u)
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            409,
            "Não é possível excluir: este usuário possui movimentações de estoque registradas. Desative-o em vez de excluir.",
        )
    audit(db, admin, "EXCLUSÃO_DE_USUÁRIO", "users", user_id, request)
    db.commit()
    return {"ok": True}

class BlockUserBody(BaseModel):
    mode: str  # "manual" | "scheduled" | "permanent" | "unblock"
    blocked_until: datetime | None = None  # obrigatório se scheduled
    reason: str | None = None


@app.post("/users/{user_id}/block")
def block_user(
    user_id: int,
    body: BlockUserBody,
    request: Request,
    admin: User = Depends(main_admin),
    db: Session = Depends(get_db),
):
    u = db.get(User, user_id)
    if not u:
        raise HTTPException(404, "Usuário não encontrado")
    if u.id == 1:
        raise HTTPException(400, "Não é possível bloquear o Administrador Principal")

    mode = (body.mode or "").lower().strip()

    if mode not in ("manual", "scheduled", "permanent"):
        raise HTTPException(400, "mode inválido")

    if mode == "scheduled":
        if not body.blocked_until:
            raise HTTPException(400, "Informe data e hora para desbloqueio automático")
        until = body.blocked_until
        if until.tzinfo is None:
            until = until.replace(tzinfo=timezone.utc)
        u.blocked_until = until
    else:
        u.blocked_until = None

    u.active = False
    u.block_type = mode
    u.block_reason = (body.reason or "").strip() or None
    u.token_version = int(getattr(u, "token_version", 0) or 0) + 1  # derruba sessão

    audit(db, admin, f"BLOQUEIO_{mode.upper()}", "users", u.id, request)
    db.commit()
    return serialize_user(u)


@app.get("/audit")
def logs(
    user_filter: str | None = Query(default=None, alias="user"),
    module: str | None = None,
    action: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    _: User = Depends(main_admin),
    db: Session = Depends(get_db),
):
    query = (
        select(AuditLog, User.name.label("user_name"))
        .outerjoin(User, AuditLog.user_id == User.id)
    )

    if user_filter and user_filter.strip():
        term = f"%{user_filter.strip()}%"
        query = query.where(
            (User.name.ilike(term))
            | (User.username.ilike(term))
        )

    if module and module.strip():
        query = query.where(AuditLog.module.ilike(f"%{module.strip()}%"))

    if action and action.strip():
        query = query.where(AuditLog.action.ilike(f"%{action.strip()}%"))

    if date_from:
        start_datetime = datetime.combine(date_from, datetime.min.time())
        query = query.where(AuditLog.created_at >= start_datetime)

    if date_to:
        end_datetime = datetime.combine(
            date_to + timedelta(days=1),
            datetime.min.time(),
        )
        query = query.where(AuditLog.created_at < end_datetime)

    rows = db.execute(
        query
        .order_by(AuditLog.created_at.desc())
        .limit(50)
    ).all()

    window_start = datetime.now(timezone.utc) - timedelta(minutes=10)
    brute_force_counts = dict(
        db.execute(
            select(AuditLog.ip, func.count(AuditLog.id))
            .where(
                AuditLog.action == "LOGIN_INVÁLIDO",
                AuditLog.ip.is_not(None),
                AuditLog.created_at >= window_start,
            )
            .group_by(AuditLog.ip)
        ).all()
    )

    return [
        {
            **serialize(log),
            "user_name": user_name or (
                "Usuário desconhecido"
                if log.action == "LOGIN_INVÁLIDO"
                else "Sistema"
            ),
            "is_brute_force": bool(
                log.ip and brute_force_counts.get(log.ip, 0) >= 5
            ),
        }
        for log, user_name in rows
    ]



@app.get("/dashboard")
def dashboard(user: User = Depends(current_user), db: Session = Depends(get_db)):
    require("dashboard")(user)

    # Atualiza automaticamente as manutenções que já chegaram à data
    update_maintenance_status(db)

    today = datetime.now().date()

    count = lambda q: db.scalar(q) or 0

    # ============================================================
    # MANUTENÇÕES
    # ============================================================

    vehicles_in_maintenance = count(
        select(func.count(func.distinct(Maintenance.vehicle_id)))
        .select_from(Maintenance)
        .where(Maintenance.status == "Em andamento")
    )

    maintenance_today = count(
        select(func.count())
        .select_from(Maintenance)
        .where(
            func.date(Maintenance.date) == today,
            Maintenance.status.in_(["Agendado", "Em andamento"]),
        )
    )

    maintenance_overdue = count(
        select(func.count())
        .select_from(Maintenance)
        .where(
            func.date(Maintenance.date) < today,
            Maintenance.status.notin_(["Concluído"]),
        )
    )

    maintenance_completed = count(
        select(func.count())
        .select_from(Maintenance)
        .where(Maintenance.status == "Concluído")
    )

    maintenance_alerts = [
        serialize(m)
        for m in db.scalars(
            select(Maintenance)
            .where(Maintenance.status == "Em andamento")
            .order_by(Maintenance.date)
            .limit(20)
        ).all()
    ]

    # ============================================================
    # DASHBOARD
    # ============================================================

    return {
    "available": count(
        select(func.count())
        .select_from(Vehicle)
        .where(Vehicle.status == "Disponível")
    ),

    "maintenance": vehicles_in_maintenance,

    "maintenance_completed": maintenance_completed,

    "routes_today": count(
        select(func.count())
        .select_from(Route)
        .where(func.date(Route.scheduled_at) == today)
    ),

    "products": count(
        select(func.count()).select_from(Product)
    ),

    "low_stock": count(
        select(func.count())
        .select_from(Product)
        .where(Product.quantity <= Product.minimum_stock)
    ),

    "fuel_cost": float(
        count(
            select(
                func.coalesce(
                    func.sum(FuelRecord.total_value),
                    0
                )
            )
        )
    ),

    "maintenance_alerts": maintenance_alerts,
}


@app.get("/stock/movements")
def movements(user: User = Depends(current_user), db: Session = Depends(get_db)):
    require("stock")(user)
    return [
        serialize(x)
        for x in db.scalars(
            select(StockMovement).order_by(StockMovement.occurred_at.desc()).limit(500)
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
    if kind not in ("entry", "output"):
        raise HTTPException(404)
    require("stock")(user)
    product = db.scalar(
        select(Product).where(Product.id == body.product_id).with_for_update()
    )
    if not product:
        raise HTTPException(404, "Produto não encontrado")
    current_qty = float(product.quantity)
    if kind == "output" and current_qty < body.quantity:
        raise HTTPException(409, "Estoque insuficiente")
    new_qty = (
        current_qty + body.quantity if kind == "entry" else current_qty - body.quantity
    )
    product.quantity = new_qty
    m = StockMovement(
        product_id=product.id,
        type="ENTRADA" if kind == "entry" else "SAÍDA",
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
    audit(db, user, m.type, "stock", m.id, request)
    db.commit()
    return {"movement": serialize(m), "quantity": float(product.quantity)}


@app.patch("/stock/movements/{movement_id}")
def edit_movement(
    movement_id: int,
    body: MovementEdit,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    require("stock")(user)
    if not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "Senha incorreta")
    m = db.get(StockMovement, movement_id)
    if not m:
        raise HTTPException(404, "Movimentação não encontrada")
    product = db.scalar(
        select(Product).where(Product.id == m.product_id).with_for_update()
    )
    if not product:
        raise HTTPException(404, "Produto não encontrado")
    current = float(product.quantity)
    old_qty = float(m.quantity)
    current = current - old_qty if m.type == "ENTRADA" else current + old_qty
    new_qty = body.quantity if body.quantity is not None else old_qty
    for field, val in (
        ("responsible", body.responsible),
        ("recipient", body.recipient),
        ("sector", body.sector),
        ("vehicle_id", body.vehicle_id),
        ("observation", body.observation),
        ("invoice", body.invoice),
        ("unit_value", body.unit_value),
    ):
        if val is not None:
            setattr(m, field, val)
    m.quantity = new_qty
    current = current + new_qty if m.type == "ENTRADA" else current - new_qty
    if current < 0:
        raise HTTPException(409, "Essa alteração deixaria o estoque negativo")
    product.quantity = current
    audit(db, user, "ALTERAÇÃO", "stock", movement_id, request)
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
    if not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "Senha incorreta")
    m = db.get(StockMovement, movement_id)
    if not m:
        raise HTTPException(404, "Movimentação não encontrada")
    product = db.scalar(
        select(Product).where(Product.id == m.product_id).with_for_update()
    )
    if product:
        qty = float(m.quantity)
        new_qty = (
            float(product.quantity) - qty
            if m.type == "ENTRADA"
            else float(product.quantity) + qty
        )
        if new_qty < 0:
            raise HTTPException(
                409, "Não é possível excluir: deixaria o estoque negativo"
            )
        product.quantity = new_qty
    db.delete(m)
    audit(db, user, "EXCLUSÃO", "stock", movement_id, request)
    db.commit()
    return {"ok": True}

@app.post("/stock/movements/{movement_id}/delete")
def delete_movement_post(
    movement_id: int,
    body: MovementDelete,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    return delete_movement(movement_id, body, request, user, db)


@app.patch("/settings/{key}")
def edit_setting(
    key: str,
    body: Payload,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    require("settings")(user)
    s = db.get(Setting, key)
    if not s:
        s = Setting(key=key)
        db.add(s)
    if "value" in body.data:
        s.value = body.data["value"]
    audit(db, user, "ALTERAÇÃO", "settings", key, request)
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
    s = db.get(Setting, key)
    if not s:
        raise HTTPException(404)
    db.delete(s)
    audit(db, user, "EXCLUSÃO", "settings", key, request)
    db.commit()
    return {"ok": True}


RESOURCES = {
    "customers": (Customer, "customers"),
    "vehicles": (Vehicle, "vehicles"),
    "drivers": (Driver, "drivers"),
    "routes": (Route, "routes"),
    "route-stops": (RouteStop, "routes"),
    "maintenance": (Maintenance, "maintenance"),
    "fuel": (FuelRecord, "fuel"),
    "products": (Product, "stock"),
    "settings": (Setting, "settings"),
}

@app.get("/commercial/products")
def list_commercial_products(
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    require("commercial")(user)
    rows = db.scalars(
        select(CommercialProduct).order_by(
            CommercialProduct.code.asc(),
            CommercialProduct.id.asc(),
        )
    ).all()
    return [serialize(row) for row in rows]


@app.post("/commercial/products")
def create_commercial_product(
    body: CommercialProductBody,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    require("commercial", write=True)(user)
    product = CommercialProduct(**body.model_dump())
    db.add(product)
    db.flush()
    audit(db, user, "CADASTRO", "commercial", product.id, request)
    db.commit()
    db.refresh(product)
    return serialize(product)


@app.patch("/commercial/products/{product_id}")
def update_commercial_product(
    product_id: int,
    body: CommercialProductBody,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    require("commercial", write=True)(user)
    product = db.get(CommercialProduct, product_id)
    if not product:
        raise HTTPException(404, "Produto/serviço não encontrado")

    for key, value in body.model_dump().items():
        setattr(product, key, value)

    audit(db, user, "ALTERAÇÃO", "commercial", product.id, request)
    db.commit()
    db.refresh(product)
    return serialize(product)


@app.delete("/commercial/products/{product_id}")
def delete_commercial_product(
    product_id: int,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    require("commercial", write=True)(user)
    product = db.get(CommercialProduct, product_id)
    if not product:
        raise HTTPException(404, "Produto/serviço não encontrado")

    db.delete(product)
    audit(db, user, "EXCLUSÃO", "commercial", product_id, request)
    db.commit()
    return {"ok": True}


# ============================================================
# PEDIDOS (filial → matriz)
# ============================================================

class OrderBody(BaseModel):
    model: str = Field(min_length=1, max_length=120)
    quality: str | None = None
    cabling: str | None = None
    breaker: str | None = None
    height: str | None = None
    quantity: float = Field(default=1, gt=0)
    order_date: date
    ship_date: date | None = None
    status: str = "pendente"
    branch: str | None = None
    notes: str | None = None


class OrderDeleteBody(BaseModel):
    password: str


def _norm_order_status(s: str) -> str:
    s = (s or "pendente").strip().lower()
    if s not in ("pendente", "atrasado", "entregue"):
        raise HTTPException(422, "Status inválido: use pendente, atrasado ou entregue")
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
    q = select(Order).order_by(Order.order_date.desc(), Order.id.desc())
    if status:
        q = q.where(Order.status == _norm_order_status(status))
    if date_from:
        q = q.where(Order.order_date >= date_from)
    if date_to:
        q = q.where(Order.order_date <= date_to)
    return [serialize(x) for x in db.scalars(q).all()]


@app.post("/orders")
def create_order(
    body: OrderBody,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    require("orders")(user)
    o = Order(
        model=body.model.strip(),
        quality=(body.quality or "").strip() or None,
        cabling=(body.cabling or "").strip() or None,
        breaker=(body.breaker or "").strip() or None,
        height=(body.height or "").strip() or None,
        quantity=body.quantity,
        order_date=body.order_date,
        ship_date=body.ship_date,
        status=_norm_order_status(body.status),
        branch=(body.branch or "").strip() or None,
        notes=(body.notes or "").strip() or None,
        created_by=user.id,
    )
    db.add(o)
    db.flush()
    audit(db, user, "CADASTRO", "orders", o.id, request)
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
    o = db.get(Order, order_id)
    if not o:
        raise HTTPException(404, "Pedido não encontrado")
    o.model = body.model.strip()
    o.quality = (body.quality or "").strip() or None
    o.cabling = (body.cabling or "").strip() or None
    o.breaker = (body.breaker or "").strip() or None
    o.height = (body.height or "").strip() or None
    o.quantity = body.quantity
    o.order_date = body.order_date
    o.ship_date = body.ship_date
    o.status = _norm_order_status(body.status)
    o.branch = (body.branch or "").strip() or None
    o.notes = (body.notes or "").strip() or None
    audit(db, user, "ALTERAÇÃO", "orders", order_id, request)
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
    if not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "Senha incorreta")
    o = db.get(Order, order_id)
    if not o:
        raise HTTPException(404, "Pedido não encontrado")
    db.delete(o)
    audit(db, user, "EXCLUSÃO", "orders", order_id, request)
    db.commit()
    return {"ok": True}


@app.get("/{resource}")
def list_resource(
    resource: str, user: User = Depends(current_user), db: Session = Depends(get_db)
):
    if resource not in RESOURCES:
        raise HTTPException(404)
    model, module = RESOURCES[resource]
    require(module)(user)

    if resource == "maintenance":
        update_maintenance_status(db)

    return [serialize(x) for x in db.scalars(select(model).limit(500)).all()]


@app.post("/{resource}")
def add_resource(
    resource: str,
    body: Payload,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    if resource not in RESOURCES:
        raise HTTPException(404)
    model, module = RESOURCES[resource]
    require(module)(user)

    data = dict(body.data)
    if resource == "drivers":
        if "cpf" in data:
            data["cpf"] = normalize_cpf(data.get("cpf"))
        if "cnh" in data:
            cnh = (data.get("cnh") or "").strip()
            data["cnh"] = cnh or None

    x = model(**model_data(model, data))
    db.add(x)
    db.flush()
    audit(db, user, "CADASTRO", module, x.id if hasattr(x, "id") else None, request)
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
    x = db.get(model, record_id)
    if not x:
        raise HTTPException(404)

    data = dict(body.data)
    if resource == "drivers":
        if "cpf" in data:
            data["cpf"] = normalize_cpf(data.get("cpf"))
        if "cnh" in data:
            cnh = (data.get("cnh") or "").strip()
            data["cnh"] = cnh or None

    for k, v in model_data(model, data).items():
        setattr(x, k, v)

    audit(db, user, "ALTERAÇÃO", module, record_id, request)
    db.commit()
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
    model, module = RESOURCES[resource]
    require(module)(user)
    x = db.get(model, record_id)
    if not x:
        raise HTTPException(404)

    if resource == "products":
        movs = db.scalars(
            select(StockMovement).where(StockMovement.product_id == record_id)
        ).all()
        for m in movs:
            db.delete(m)
        db.flush()

    try:
        db.delete(x)
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            409, "Não é possível excluir: existem registros vinculados a este item"
        )
    audit(db, user, "EXCLUSÃO", module, record_id, request)
    db.commit()
    return {"ok": True}


# ============================================================
# MÓDULO DE AGENDAMENTO (instalações / postes)
# ============================================================


class RouteSlotCreate(BaseModel):
    week_id: int
    date: date
    region_code: str = Field(min_length=1, max_length=10)
    route_label: str | None = None
    total_slots: int = Field(ge=0)
    driver_id: int | None = None
    second_driver_id: int | None = None
    vehicle_id: int | None = None
    notes: str | None = None


class RouteSlotUpdate(BaseModel):
    region_code: str | None = None
    route_label: str | None = None
    total_slots: int | None = Field(default=None, ge=0)
    driver_id: int | None = None
    second_driver_id: int | None = None
    vehicle_id: int | None = None
    closed: bool | None = None
    notes: str | None = None


class ScheduleEntryCreate(BaseModel):
    route_slot_id: int
    service_description: str = Field(min_length=1, max_length=200)
    client_name: str = Field(min_length=1, max_length=120)
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
    description: str = Field(min_length=1, max_length=200)
    observation: str | None = None
    status: str = "Normal"


class ScheduleWeekCreate(BaseModel):
    start_date: date
    label: str | None = None


class MoveEntryBody(BaseModel):
    direction: str  # "up" ou "down"

class ReorderEntriesBody(BaseModel):
    route_slot_id: int
    ordered_ids: list[int]

class TransferEntryBody(BaseModel):
    target_route_slot_id: int


class TransferSlotBody(BaseModel):
    new_date: date
    week_id: int | None = None  # se mudar de semana


class DeleteWeekBody(BaseModel):
    password: str


def calcular_vagas(service_description: str) -> int:
    match = re.match(r'^(\d+)', (service_description or '').strip())
    return int(match.group(1)) if match else 0


def serialize_extra(x: ScheduleExtra):
    return serialize(x)


def serialize_entry(x: ScheduleEntry, db: Session):
    d = serialize(x)
    extras = db.scalars(
        select(ScheduleExtra).where(ScheduleExtra.entry_id == x.id)
    ).all()
    d["extras"] = [serialize_extra(e) for e in extras]
    # Garante que os novos campos sempre apareçam
    d["comanda"] = x.comanda
    d["pago"] = bool(x.pago)
    d["cooperativa_nome"] = x.cooperativa_nome
    d["slots_consumed"] = x.slots_consumed if x.slots_consumed is not None else calcular_vagas(x.service_description)
    return d


def serialize_route_slot(x: RouteSlot, db: Session):
    d = serialize(x)
    entries = db.scalars(
        select(ScheduleEntry)
        .where(ScheduleEntry.route_slot_id == x.id)
        .order_by(ScheduleEntry.position)
    ).all()
    d["entries"] = [serialize_entry(e, db) for e in entries]
    # Soma real de vagas consumidas
    used = sum(
        (e.slots_consumed or calcular_vagas(e.service_description)) for e in entries
    )
    d["slots_used"] = used
    d["slots_available"] = max(x.total_slots - used, 0)
    driver = db.get(Driver, x.driver_id) if x.driver_id else None
    second_driver = db.get(Driver, x.second_driver_id) if x.second_driver_id else None
    vehicle = db.get(Vehicle, x.vehicle_id) if x.vehicle_id else None
    d["driver"] = serialize(driver) if driver else None
    d["second_driver"] = serialize(second_driver) if second_driver else None
    d["vehicle"] = serialize(vehicle) if vehicle else None
    return d


def serialize_week(x: ScheduleWeek, db: Session):
    slots = db.scalars(
        select(RouteSlot)
        .where(RouteSlot.week_id == x.id)
        .order_by(RouteSlot.date, RouteSlot.id)
    ).all()
    d = serialize(x)
    d["route_slots"] = [serialize_route_slot(s, db) for s in slots]
    return d


@app.get("/schedule/weeks")
def list_schedule_weeks(
    include_archived: bool = False,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    require("schedule")(user)
    q = select(ScheduleWeek).order_by(ScheduleWeek.start_date)
    if not include_archived:
        q = q.where(ScheduleWeek.status == WeekStatus.ATIVA)
    weeks = db.scalars(q).all()
    return [serialize_week(w, db) for w in weeks]


@app.post("/schedule/weeks")
def create_schedule_week(
    body: ScheduleWeekCreate,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    require("schedule", write=True)(user)
    w = ScheduleWeek(start_date=body.start_date, label=body.label, status=WeekStatus.ATIVA)
    db.add(w)
    db.flush()
    audit(db, user, "CRIAÇÃO_SEMANA", "schedule", w.id, request)
    db.commit()
    return serialize_week(w, db)


@app.delete("/schedule/weeks/{week_id}")
def delete_schedule_week(
    week_id: int,
    body: DeleteWeekBody,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    """Exclui permanentemente a semana. Somente Admin Principal + senha."""
    if user.id != 1 or user.role != Role.ADMIN:
        raise HTTPException(403, "Apenas o Administrador Principal pode excluir semanas")
    if not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "Senha incorreta")
    w = db.get(ScheduleWeek, week_id)
    if not w:
        raise HTTPException(404, "Semana não encontrada")
    db.delete(w)
    audit(db, user, "EXCLUSÃO_SEMANA", "schedule", week_id, request)
    db.commit()
    return {"ok": True}


@app.post("/schedule/weeks/{week_id}/archive")
def archive_schedule_week(
    week_id: int,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    if user.id != 1:
        permissions = (user.permissions or "").split(",")

        if "schedule_archive" not in permissions:
            raise HTTPException(
                403,
                "Você não possui permissão para arquivar semanas."
            )

    w = db.get(ScheduleWeek, week_id)

    if not w:
        raise HTTPException(404, "Semana não encontrada")

    w.status = WeekStatus.ARQUIVADA
    w.archived_at = func.now()

    audit(
        db,
        user,
        "ARQUIVAMENTO_SEMANA",
        "schedule",
        week_id,
        request
    )

    db.commit()

    return {"ok": True}
@app.post("/schedule/route-slots")
def create_route_slot(
    body: RouteSlotCreate,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    require("schedule", write=True)(user)
    week = db.get(ScheduleWeek, body.week_id)
    if not week:
        raise HTTPException(404, "Semana não encontrada")
    if week.status != WeekStatus.ATIVA:
        raise HTTPException(409, "Não é possível adicionar rota em semana arquivada")

    rs = RouteSlot(
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
    audit(db, user, "CRIAÇÃO_ROTA", "schedule", rs.id, request)
    db.commit()
    return serialize_route_slot(rs, db)

@app.patch("/schedule/route-slots/{slot_id}")
def update_route_slot(
    slot_id: int,
    body: RouteSlotUpdate,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    require("schedule", write=True)(user)
    rs = db.get(RouteSlot, slot_id)
    if not rs:
        raise HTTPException(404, "Rota não encontrada")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(rs, k, v)
    audit(db, user, "ALTERAÇÃO", "schedule", slot_id, request)
    db.commit()
    return serialize_route_slot(rs, db)


@app.delete("/schedule/route-slots/{slot_id}")
def delete_route_slot(
    slot_id: int,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    require("schedule", write=True)(user)
    rs = db.get(RouteSlot, slot_id)
    if not rs:
        raise HTTPException(404, "Rota não encontrada")
    db.delete(rs)
    audit(db, user, "EXCLUSÃO", "schedule", slot_id, request)
    db.commit()
    return {"ok": True}


@app.post("/schedule/entries")
def create_schedule_entry(
    body: ScheduleEntryCreate,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    require("schedule", write=True)(user)
    rs = db.get(RouteSlot, body.route_slot_id)
    if not rs:
        raise HTTPException(404, "Rota não encontrada")
    if rs.closed:
        raise HTTPException(409, "Esta rota está fechada para novos clientes")

    slots_needed = body.slots_consumed or calcular_vagas(body.service_description)

    # Calcula vagas já usadas
    entries = db.scalars(
        select(ScheduleEntry).where(ScheduleEntry.route_slot_id == rs.id)
    ).all()
    used = sum((e.slots_consumed or calcular_vagas(e.service_description)) for e in entries)

    if rs.total_slots and (used + slots_needed) > rs.total_slots:
        raise HTTPException(409, "Não há vagas suficientes nesta rota")

    entry = ScheduleEntry(
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
    audit(db, user, "CADASTRO", "schedule", entry.id, request)
    db.commit()
    return serialize_entry(entry, db)


@app.patch("/schedule/entries/{entry_id}")
def update_schedule_entry(
    entry_id: int,
    body: ScheduleEntryUpdate,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    require("schedule", write=True)(user)
    entry = db.get(ScheduleEntry, entry_id)
    if not entry:
        raise HTTPException(404, "Cliente não encontrado")

    data = body.model_dump(exclude_unset=True)

    # Se mudou o serviço, recalcula slots_consumed
    if "service_description" in data and "slots_consumed" not in data:
        data["slots_consumed"] = calcular_vagas(data["service_description"])

    for k, v in data.items():
        setattr(entry, k, v)

    audit(db, user, "ALTERAÇÃO", "schedule", entry_id, request)
    db.commit()
    return serialize_entry(entry, db)


@app.delete("/schedule/entries/{entry_id}")
def delete_schedule_entry(
    entry_id: int,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    require("schedule", write=True)(user)
    entry = db.get(ScheduleEntry, entry_id)
    if not entry:
        raise HTTPException(404, "Cliente não encontrado")
    slot_id, removed_pos = entry.route_slot_id, entry.position
    db.delete(entry)
    db.flush()
    later = db.scalars(
        select(ScheduleEntry).where(
            ScheduleEntry.route_slot_id == slot_id,
            ScheduleEntry.position > removed_pos,
        )
    ).all()
    for e in later:
        e.position -= 1
    audit(db, user, "EXCLUSÃO", "schedule", entry_id, request)
    db.commit()
    return {"ok": True}

@app.post("/schedule/entries/{entry_id}/move")
def move_schedule_entry(
    entry_id: int,
    body: MoveEntryBody,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    require("schedule", write=True)(user)
    entry = db.get(ScheduleEntry, entry_id)
    if not entry:
        raise HTTPException(404, "Cliente não encontrado")

    direction = body.direction.lower()
    if direction not in ("up", "down"):
        raise HTTPException(400, "direction deve ser 'up' ou 'down'")

    new_pos = entry.position - 1 if direction == "up" else entry.position + 1
    if new_pos < 1:
        raise HTTPException(400, "Já está na primeira posição")

    other = db.scalar(
        select(ScheduleEntry).where(
            ScheduleEntry.route_slot_id == entry.route_slot_id,
            ScheduleEntry.position == new_pos,
        )
    )
    if not other:
        raise HTTPException(400, "Não há cliente nessa posição")

    entry.position, other.position = other.position, entry.position
    audit(db, user, "REORDENAÇÃO", "schedule", entry_id, request)
    db.commit()
    return {"ok": True}


@app.post("/schedule/entries/reorder")
def reorder_schedule_entries(
    body: ReorderEntriesBody,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    require("schedule", write=True)(user)
    if not body.ordered_ids:
        raise HTTPException(400, "Lista de ordenação vazia")

    rs = db.get(RouteSlot, body.route_slot_id)
    if not rs:
        raise HTTPException(404, "Rota não encontrada")

    entries = db.scalars(
        select(ScheduleEntry).where(ScheduleEntry.route_slot_id == body.route_slot_id)
    ).all()
    by_id = {e.id: e for e in entries}

    if set(body.ordered_ids) != set(by_id.keys()):
        raise HTTPException(
            400,
            "A lista de IDs não confere com os clientes desta rota",
        )

    for index, entry_id in enumerate(body.ordered_ids, start=1):
        by_id[entry_id].position = index

    audit(db, user, "REORDENAÇÃO", "schedule", body.route_slot_id, request)
    db.commit()
    return {"ok": True}

@app.post("/schedule/entries/{entry_id}/transfer")
def transfer_schedule_entry(
    entry_id: int,
    body: TransferEntryBody,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    require("schedule", write=True)(user)
    entry = db.get(ScheduleEntry, entry_id)
    if not entry:
        raise HTTPException(404, "Cliente não encontrado")

    target = db.get(RouteSlot, body.target_route_slot_id)
    if not target:
        raise HTTPException(404, "Rota de destino não encontrada")
    if target.closed:
        raise HTTPException(409, "A rota de destino está fechada")
    if entry.route_slot_id == target.id:
        raise HTTPException(400, "O cliente já está nesta rota")

    slots_needed = entry.slots_consumed or calcular_vagas(entry.service_description)
    dest_entries = db.scalars(
        select(ScheduleEntry).where(ScheduleEntry.route_slot_id == target.id)
    ).all()
    used = sum(
        (e.slots_consumed or calcular_vagas(e.service_description)) for e in dest_entries
    )
    if target.total_slots and (used + slots_needed) > target.total_slots:
        raise HTTPException(409, "Não há vagas suficientes na rota de destino")

    old_slot_id = entry.route_slot_id
    old_pos = entry.position

    entry.route_slot_id = target.id
    entry.position = len(dest_entries) + 1
    db.flush()

    later = db.scalars(
        select(ScheduleEntry).where(
            ScheduleEntry.route_slot_id == old_slot_id,
            ScheduleEntry.position > old_pos,
        )
    ).all()
    for e in later:
        e.position -= 1

    audit(db, user, "TRANSFERÊNCIA_CLIENTE", "schedule", entry_id, request)
    db.commit()
    return serialize_entry(entry, db)


@app.post("/schedule/route-slots/{slot_id}/transfer")
def transfer_route_slot(
    slot_id: int,
    body: TransferSlotBody,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    require("schedule", write=True)(user)
    rs = db.get(RouteSlot, slot_id)
    if not rs:
        raise HTTPException(404, "Rota não encontrada")

    target_week_id = body.week_id if body.week_id is not None else rs.week_id
    week = db.get(ScheduleWeek, target_week_id)
    if not week:
        raise HTTPException(404, "Semana de destino não encontrada")
    if week.status != WeekStatus.ATIVA:
        raise HTTPException(409, "Não é possível transferir para semana arquivada")

    rs.date = body.new_date
    rs.week_id = target_week_id
    audit(db, user, "TRANSFERÊNCIA_ROTA", "schedule", slot_id, request)
    db.commit()
    return serialize_route_slot(rs, db)


@app.post("/schedule/extras")
def create_schedule_extra(
    body: ScheduleExtraCreate,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    require("schedule", write=True)(user)
    if not db.get(ScheduleEntry, body.entry_id):
        raise HTTPException(404, "Cliente não encontrado")
    extra = ScheduleExtra(**body.model_dump())
    db.add(extra)
    db.flush()
    audit(db, user, "CADASTRO", "schedule", extra.id, request)
    db.commit()
    return serialize_extra(extra)


@app.delete("/schedule/extras/{extra_id}")
def delete_schedule_extra(
    extra_id: int,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    require("schedule", write=True)(user)
    extra = db.get(ScheduleExtra, extra_id)
    if not extra:
        raise HTTPException(404, "Item não encontrado")
    db.delete(extra)
    audit(db, user, "EXCLUSÃO", "schedule", extra_id, request)
    db.commit()
    return {"ok": True}


@app.get("/schedule/route-slots/{slot_id}/export")
def export_route_slot(
    slot_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    require("schedule")(user)
    rs = db.get(RouteSlot, slot_id)
    if not rs:
        raise HTTPException(404, "Rota não encontrada")
    entries = db.scalars(
        select(ScheduleEntry)
        .where(ScheduleEntry.route_slot_id == rs.id)
        .order_by(ScheduleEntry.position)
    ).all()
    lines = []
    for e in entries:
        lines.append(f"*{e.position:02d}°* - {e.client_name.upper()}")
        if e.location_link:
            lines.append(f"localização: {e.location_link}")
        if e.phone:
            lines.append(f"tel: {e.phone}")
        if e.observation:
            lines.append(f"*obs: {e.observation}*")          # ← OBS em negrito
        extras = db.scalars(
            select(ScheduleExtra).where(ScheduleExtra.entry_id == e.id)
        ).all()
        for extra in extras:
            lines.append(f"+ {extra.description}")
        lines.append("")
    text = "\n".join(lines).strip()
    return Response(content=text, media_type="text/plain; charset=utf-8")

# ============================================================
# ADMIN — backup + configurações críticas
# ============================================================

class CriticalBody(BaseModel):
    password: str = Field(min_length=1)
    confirm_text: str | None = None


def _assert_critical(
    user: User,
    body: CriticalBody,
    expected_confirm: str | None = None,
):
    if user.id != 1 or user.role != Role.ADMIN:
        raise HTTPException(403, "Apenas o Administrador Principal")
    if not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "Senha incorreta")
    if expected_confirm and (body.confirm_text or "").strip() != expected_confirm:
        raise HTTPException(400, f"Digite exatamente: {expected_confirm}")


@app.get("/admin/backup/export")
def backup_export(
    user: User = Depends(main_admin),
    db: Session = Depends(get_db),
):
    from datetime import timezone

def block_payload(u: User) -> dict | None:
    """Se bloqueado agora, retorna info; se scheduled já passou, limpa e retorna None."""
    if u.active and not u.block_type:
        return None

    # auto-desbloqueio programado
    if u.block_type == "scheduled" and u.blocked_until:
        until = u.blocked_until
        if until.tzinfo is None:
            until = until.replace(tzinfo=timezone.utc)
        now = datetime.now(timezone.utc)
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
            until = until.replace(tzinfo=timezone.utc)
        until_iso = until.isoformat()

    return {
        "blocked": True,
        "block_type": u.block_type or "manual",
        "blocked_until": until_iso,
        "reason": u.block_reason,
    }


@app.post("/admin/critical/revoke-sessions")
def critical_revoke_sessions(
    body: CriticalBody,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    _assert_critical(user, body, "ENCERRAR SESSOES")

    # Encerra as sessões de todos os usuários,
    # EXCETO o administrador que executou a ação.
    for u in db.scalars(select(User)).all():
        if u.id != user.id:
            u.token_version = int(getattr(u, "token_version", 0) or 0) + 1

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
        "detail": "Todas as sessões dos demais usuários foram encerradas",
    }


@app.post("/admin/critical/purge-users")
def critical_purge_users(
    body: CriticalBody,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    _assert_critical(user, body, "REMOVER USUARIOS")
    others = db.scalars(select(User).where(User.id != 1)).all()
    for u in others:
        db.execute(
            update(AuditLog).where(AuditLog.user_id == u.id).values(user_id=None)
        )
        try:
            db.delete(u)
            db.flush()
        except IntegrityError:
            db.rollback()
            raise HTTPException(
                409,
                f"Não foi possível excluir {u.username}: há vínculos.",
            )
    audit(db, user, "CRITICO_PURGE_USERS", "admin", None, request)
    db.commit()
    return {"ok": True, "removed": len(others)}


@app.post("/admin/critical/wipe-operational")
def critical_wipe_operational(
    body: CriticalBody,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    _assert_critical(user, body, "EXCLUIR DADOS")
    for model in (
        ScheduleExtra,
        ScheduleEntry,
        RouteSlot,
        ScheduleWeek,
        StockMovement,
        Maintenance,
        FuelRecord,
    ):
        db.execute(model.__table__.delete())
    audit(db, user, "CRITICO_WIPE_OPERATIONAL", "admin", None, request)
    db.commit()
    return {"ok": True, "detail": "Dados operacionais removidos"}

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
    model: str = Field(min_length=1, max_length=80)
    quantity: float = Field(ge=0)
    emergency_altered: float = Field(default=0, ge=0)


class ProductionBatchIn(BaseModel):
    kind: str
    production_date: date
    lines: list[ProductionLineIn]
    notes: str | None = None


def _can_prod(user: User, need: str) -> bool:
    if user.id == 1:
        return True
    perms = set((user.permissions or "").split(",")) if user.permissions else set()
    grants = MODULES.get(user.role, set()) if not user.permissions else perms
    if "*" in grants or "*" in perms:
        return True
    return need in perms or need in grants


@app.get("/production/models")
def production_models(user: User = Depends(current_user)):
    if not (_can_prod(user, "production") or _can_prod(user, "assembly")):
        raise HTTPException(403, "Sem permissão")
    return list(PRODUCTION_MODELS)


@app.post("/production/batch")
def create_production_batch(
    body: ProductionBatchIn,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    kind = (body.kind or "").lower().strip()
    if kind not in ("fabricacao", "montagem"):
        raise HTTPException(400, "kind inválido")
    if kind == "fabricacao" and not _can_prod(user, "production"):
        raise HTTPException(403, "Sem permissão de Produção")
    if kind == "montagem" and not _can_prod(user, "assembly"):
        raise HTTPException(403, "Sem permissão de Montagem")
    if not body.lines:
        raise HTTPException(400, "Informe ao menos um modelo")

    created = []
    for line in body.lines:
        qty = float(line.quantity or 0)
        em = float(line.emergency_altered or 0) if kind == "montagem" else 0.0
        if qty <= 0 and em <= 0:
            continue
        rec = ProductionRecord(
            kind=kind,
            production_date=body.production_date,
            model=line.model.strip(),
            quantity=qty,
            emergency_altered=em,
            notes=body.notes,
            user_id=user.id,
        )
        db.add(rec)
        db.flush()
        created.append(serialize(rec))

    if not created:
        raise HTTPException(400, "Nenhuma quantidade informada")
    audit(db, user, "PRODUCAO_LOTE", "production", None, request)
    db.commit()
    return {"ok": True, "count": len(created), "records": created}


@app.get("/production/by-day")
def production_by_day(
    date_from: date | None = None,
    date_to: date | None = None,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    allow_fab = _can_prod(user, "production")
    allow_mnt = _can_prod(user, "assembly")
    if not allow_fab and not allow_mnt:
        raise HTTPException(403, "Sem permissão")

    q = select(ProductionRecord).order_by(
        ProductionRecord.production_date.desc(),
        ProductionRecord.kind,
        ProductionRecord.model,
    )
    if date_from:
        q = q.where(ProductionRecord.production_date >= date_from)
    if date_to:
        q = q.where(ProductionRecord.production_date <= date_to)

    rows = db.scalars(q.limit(3000)).all()
    days: dict[str, dict] = {}
    for r in rows:
        if r.kind == "fabricacao" and not allow_fab:
            continue
        if r.kind == "montagem" and not allow_mnt:
            continue
        key = r.production_date.isoformat() if r.production_date else ""
        if key not in days:
            days[key] = {
                "date": key,
                "fabricacao": [],
                "montagem": [],
                "fabricacao_total": 0.0,
                "montagem_total": 0.0,
                "emergency_total": 0.0,
            }
        item = {
            "id": r.id,
            "model": r.model,
            "quantity": float(r.quantity or 0),
            "emergency_altered": float(r.emergency_altered or 0),
            "user_id": r.user_id,
            "notes": r.notes,
        }
        if r.kind == "fabricacao":
            days[key]["fabricacao"].append(item)
            days[key]["fabricacao_total"] += item["quantity"]
        else:
            days[key]["montagem"].append(item)
            days[key]["montagem_total"] += item["quantity"]
            days[key]["emergency_total"] += item["emergency_altered"]

    return sorted(days.values(), key=lambda x: x["date"], reverse=True)

@app.get("/production/export")
def export_production(
    date_from: date | None = None,
    date_to: date | None = None,
    kind: str | None = None,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    """JSON completo para backup (antes de apagar)."""
    if not (_can_prod(user, "production") or _can_prod(user, "assembly")):
        raise HTTPException(403, "Sem permissão")
    q = select(ProductionRecord).order_by(
        ProductionRecord.production_date, ProductionRecord.kind, ProductionRecord.model
    )
    if date_from:
        q = q.where(ProductionRecord.production_date >= date_from)
    if date_to:
        q = q.where(ProductionRecord.production_date <= date_to)
    if kind in ("fabricacao", "montagem"):
        q = q.where(ProductionRecord.kind == kind)
    rows = db.scalars(q).all()
    return {
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "date_from": date_from.isoformat() if date_from else None,
        "date_to": date_to.isoformat() if date_to else None,
        "count": len(rows),
        "records": [serialize(r) for r in rows],
    }


class ProductionPurgeBody(BaseModel):
    password: str
    date_from: date | None = None
    date_to: date | None = None
    confirm_text: str  # deve ser APAGAR PRODUCAO


@app.post("/production/purge")
def purge_production(
    body: ProductionPurgeBody,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    """Apaga lançamentos (só depois do backup no front). Exige senha."""
    if user.id != 1 and user.role != Role.ADMIN and user.role != Role.MANAGER:
        # ajuste: só admin/gerente
        if not getattr(user, "is_main_admin", False) and user.id != 1:
            if user.role not in (Role.ADMIN, Role.MANAGER):
                raise HTTPException(403, "Apenas administrador ou gerente")
    if body.confirm_text.strip().upper() != "APAGAR PRODUCAO":
        raise HTTPException(400, "Digite APAGAR PRODUCAO para confirmar")
    if not verify_password(body.password, user.password_hash):
        raise HTTPException(403, "Senha incorreta")

    q = select(ProductionRecord)
    if body.date_from:
        q = q.where(ProductionRecord.production_date >= body.date_from)
    if body.date_to:
        q = q.where(ProductionRecord.production_date <= body.date_to)
    rows = db.scalars(q).all()
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
    return {"ok": True, "deleted": n}

# ============================================================
# ESQUECI MINHA SENHA
# ============================================================

class ForgotPasswordBody(BaseModel):
    username: str = Field(min_length=1, max_length=60)
    email: str = Field(min_length=5, max_length=160)


class ResetPasswordBody(BaseModel):
    token: str = Field(min_length=20, max_length=200)
    new_password: str = Field(min_length=3, max_length=200)


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _send_reset_email(to_email: str, reset_link: str) -> bool:
    host = os.environ.get("SMTP_HOST")
    user = os.environ.get("SMTP_USER")
    password = os.environ.get("SMTP_PASSWORD")
    port = int(os.environ.get("SMTP_PORT") or 587)
    from_addr = os.environ.get("SMTP_FROM") or user
    if not host or not user or not password or not from_addr:
        return False

    front = (os.environ.get("FRONTEND_URL") or "https://logisticasbill.vercel.app").rstrip("/")
    logo_url = f"{front}/icon2.png"

    text = (
        "LOGÍSTICAS BILL — Redefinição de senha\n\n"
        "Recebemos um pedido para redefinir a senha da sua conta.\n"
        f"Abra o link abaixo (válido por 1 hora):\n{reset_link}\n\n"
        "Se você não solicitou, ignore este e-mail.\n"
    )
    html = f"""\
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head><meta charset="utf-8"/></head>
        <body style="margin:0;padding:0;background:#f4f7fb;font-family:Arial,Helvetica,sans-serif;color:#16253a;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7fb;padding:24px 12px;">
            <tr><td align="center">
              <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.06);">
                <tr>
                  <td style="background:#0f2846;padding:20px 24px;text-align:center;">
                    <img src="{logo_url}" alt="Logísticas Bill" width="56" height="56" style="display:inline-block;border:0;"/>
                    <div style="color:#ffffff;font-size:18px;font-weight:bold;margin-top:10px;letter-spacing:0.5px;">LOGÍSTICAS BILL</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:28px 24px;">
                    <h1 style="margin:0 0 12px;font-size:20px;color:#0f2846;">Redefinição de senha</h1>
                    <p style="margin:0 0 16px;font-size:14px;line-height:1.5;color:#475569;">
                      Recebemos um pedido para redefinir a senha da sua conta no sistema.
                      Clique no botão abaixo. Este link é <strong>válido por 1 hora</strong>.
                    </p>
                    <p style="text-align:center;margin:28px 0;">
                      <a href="{reset_link}"
                         style="display:inline-block;background:#0e7490;color:#ffffff;text-decoration:none;
                                font-size:14px;font-weight:bold;padding:12px 28px;border-radius:8px;">
                        Redefinir minha senha
                      </a>
                    </p>
                    <p style="margin:0 0 8px;font-size:12px;color:#64748b;line-height:1.4;">
                      Se o botão não funcionar, copie e cole no navegador:<br/>
                      <a href="{reset_link}" style="color:#0e7490;word-break:break-all;">{reset_link}</a>
                    </p>
                    <p style="margin:16px 0 0;font-size:12px;color:#94a3b8;">
                      Se você não solicitou esta alteração, ignore este e-mail. Nenhuma senha será alterada.
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="background:#f8fafc;padding:14px 24px;text-align:center;font-size:11px;color:#94a3b8;">
                    © Logísticas Bill — sistema interno · não responda este e-mail
                  </td>
                </tr>
              </table>
            </td></tr>
          </table>
        </body>
        </html>
        """
    msg = EmailMessage()
    msg["Subject"] = "Logísticas Bill — redefinir senha"
    msg["From"] = from_addr
    msg["To"] = to_email
    msg.set_content(text)
    msg.add_alternative(html, subtype="html")
    try:
        with smtplib.SMTP(host, port, timeout=20) as s:
            s.starttls()
            s.login(user, password)
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
    username = body.username.strip()
    email = body.email.strip().lower()
    u = db.scalar(select(User).where(User.username == username))

    # Só gera token se usuário + e-mail cadastrado baterem
    if u and (u.email or "").strip().lower() == email and u.active:
        for old in db.scalars(
            select(PasswordResetToken).where(
                PasswordResetToken.user_id == u.id,
                PasswordResetToken.used_at.is_(None),
            )
        ).all():
            old.used_at = datetime.now(timezone.utc)

        raw = secrets.token_urlsafe(32)
        db.add(
            PasswordResetToken(
                user_id=u.id,
                token_hash=_hash_token(raw),
                expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
            )
        )
        front = (os.environ.get("FRONTEND_URL") or "https://logisticasbill.vercel.app").rstrip("/")
        link = f"{front}/?reset_token={raw}"
        sent = _send_reset_email(email, link)
        audit(
            db,
            u,
            "FORGOT_PASSWORD",
            "auth",
            request=request,
            details="E-mail enviado" if sent else "Token gerado (SMTP ausente ou falhou)",
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
        "detail": "Se os dados estiverem corretos, você receberá um e-mail com o link em alguns minutos.",
    }


@app.post("/auth/reset-password")
@limiter.limit("10/minute")
def reset_password(
    body: ResetPasswordBody,
    request: Request,
    db: Session = Depends(get_db),
):
    th = _hash_token(body.token.strip())
    row = db.scalar(
        select(PasswordResetToken).where(PasswordResetToken.token_hash == th)
    )
    if not row or row.used_at is not None:
        raise HTTPException(400, "Link inválido ou já usado")
    exp = row.expires_at
    if exp is None:
        raise HTTPException(400, "Link inválido")
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    else:
        exp = exp.astimezone(timezone.utc)
    if datetime.now(timezone.utc) >= exp:
        raise HTTPException(400, "Link expirado. Solicite a redefinição novamente.")

    u = db.get(User, row.user_id)
    if not u or not u.active:
        raise HTTPException(400, "Usuário indisponível")

    u.password_hash = hash_password(body.new_password)
    u.must_change_password = False
    u.token_version = int(getattr(u, "token_version", 0) or 0) + 1
    row.used_at = datetime.now(timezone.utc)
    audit(db, u, "RESET_PASSWORD", "auth", request=request)
    db.commit()
    return {"ok": True, "detail": "Senha alterada. Faça login."}
