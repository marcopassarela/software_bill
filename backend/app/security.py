from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import APIKeyCookie
from pwdlib import PasswordHash
from sqlalchemy.orm import Session, object_session
from .config import get_settings
from .database import get_db
from .models import User, Role, Company
from .plans import plan_modules, normalize_plan
from .tenancy import set_current_company

password_hash = PasswordHash.recommended()
cookie = APIKeyCookie(name="gl_session", auto_error=False)

# Módulos que cada perfil (Role) pode acessar. O acesso final de um usuário é
# a interseção entre (a) os módulos liberados pelo PLANO da empresa e
# (b) os módulos do perfil ou as permissões customizadas do usuário.
MODULES = {
    Role.ADMIN: {"*"},
    Role.MANAGER: {
        "dashboard", "routes", "vehicles", "drivers", "maintenance", "fuel",
        "stock", "customers", "reports", "schedule", "production", "assembly", "orders",
    },
    Role.LOGISTICS: {"dashboard", "routes", "vehicles", "drivers", "fuel", "customers"},
    Role.STOCK: {"dashboard", "stock"},
    Role.ALMOXARIFADO: {"dashboard", "stock"},
    Role.DRIVER: {"routes"},
    Role.VIEWER: {
        "dashboard", "routes", "vehicles", "drivers", "maintenance", "fuel",
        "stock", "customers", "reports", "schedule",
    },
    Role.MONTAGEM: {"dashboard", "production", "assembly"},
}

WRITE_ONLY_ROLES = {
    "schedule": {Role.ADMIN, Role.MANAGER},
}


def hash_password(password: str):
    return password_hash.hash(password)


def verify_password(password: str, hashed: str):
    return password_hash.verify(password, hashed)


def token_for(user: User, unit: str = "matriz"):
    s = get_settings()
    unit = (unit or "matriz").strip().lower()
    if unit not in ("matriz", "filial"):
        unit = "matriz"
    return jwt.encode(
        {
            "sub": str(user.id),
            "ver": int(getattr(user, "token_version", 0) or 0),
            "unit": unit,
            "exp": datetime.now(timezone.utc) + timedelta(minutes=s.access_token_minutes),
        },
        s.auth_secret,
        algorithm="HS256",
    )


def _plan_of(user: User) -> str:
    """Plano ATIVO da empresa do usuário (fonte de verdade dos limites)."""
    company = getattr(user, "company", None)
    if company is not None:
        return normalize_plan(getattr(company, "plan", None))
    # fallback: tenta carregar via sessão
    db = object_session(user)
    cid = getattr(user, "company_id", None)
    if db is not None and cid is not None:
        c = db.get(Company, cid)
        if c is not None:
            return normalize_plan(c.plan)
    return normalize_plan(getattr(user, "plan", None))


def plan_of_user(user: User) -> str:
    return _plan_of(user)


def effective_modules(user: User, raw_permissions=None) -> set[str]:
    """Módulos que o usuário realmente acessa = plano da empresa ∩ (perfil | permissões)."""
    allowed_by_plan = plan_modules(_plan_of(user))

    if raw_permissions is None:
        raw_permissions = user.permissions

    if raw_permissions:
        grants = {p.strip() for p in str(raw_permissions).split(",") if p.strip()}
    else:
        grants = set(MODULES.get(user.role, set()))

    if "*" in grants:
        return set(allowed_by_plan)

    base = {g for g in grants if not g.startswith("schedule_")}
    result = base & allowed_by_plan
    if "schedule" in allowed_by_plan:
        result |= {g for g in grants if g.startswith("schedule_")}
    return result


def clear_block(u: User):
    u.active = True
    u.block_type = None
    u.blocked_until = None
    u.block_reason = None


def block_detail(u: User) -> dict:
    until = getattr(u, "blocked_until", None)
    until_iso = None
    if until is not None:
        if until.tzinfo is None:
            until = until.replace(tzinfo=timezone.utc)
        until_iso = until.isoformat()
    return {
        "code": "USER_BLOCKED",
        "message": "Conta bloqueada",
        "blocked": True,
        "block_type": getattr(u, "block_type", None) or "manual",
        "blocked_until": until_iso,
        "reason": getattr(u, "block_reason", None),
    }


def apply_auto_unblock(u: User) -> bool:
    """Se scheduled venceu, libera. Retorna True se ainda bloqueado."""
    if u.active and not getattr(u, "block_type", None):
        return False
    if not u.active:
        if u.block_type == "scheduled" and u.blocked_until:
            until = u.blocked_until
            if until.tzinfo is None:
                until = until.replace(tzinfo=timezone.utc)
            if datetime.now(timezone.utc) >= until:
                clear_block(u)
                return False
        return True
    return False


def current_user(token: str | None = Depends(cookie), db: Session = Depends(get_db)):
    if not token:
        raise HTTPException(status_code=401, detail="Não autenticado")
    try:
        data = jwt.decode(token, get_settings().auth_secret, algorithms=["HS256"])
        # Busca do usuário SEM filtro de tenant (ainda não sabemos a empresa).
        user = db.get(User, int(data["sub"]))
    except Exception:
        raise HTTPException(status_code=401, detail="Sessão inválida")
    if not user:
        raise HTTPException(status_code=401, detail="Usuário indisponível")

    # A partir daqui todas as consultas ficam isoladas na empresa do usuário.
    set_current_company(db, getattr(user, "company_id", None))

    # Empresa desativada bloqueia o acesso de todos os usuários dela.
    cid = getattr(user, "company_id", None)
    if cid is not None:
        company = db.get(Company, cid)
        if company is not None and not company.active:
            raise HTTPException(
                status_code=403,
                detail="Assinatura da empresa inativa. Contate o administrador.",
            )

    was_inactive = not user.active
    still_blocked = apply_auto_unblock(user)
    if was_inactive and not still_blocked:
        db.commit()
    if still_blocked:
        raise HTTPException(status_code=403, detail=block_detail(user))

    token_ver = int(data.get("ver", 0) or 0)
    user_ver = int(getattr(user, "token_version", 0) or 0)
    if token_ver != user_ver:
        raise HTTPException(
            status_code=401,
            detail="Sessão encerrada. Faça login novamente.",
        )

    unit = (data.get("unit") or "matriz")
    if isinstance(unit, str):
        unit = unit.strip().lower()
    else:
        unit = "matriz"
    if unit not in ("matriz", "filial"):
        unit = "matriz"
    user._session_unit = unit
    return user


def require(module: str, write: bool = False):
    def check(user: User = Depends(current_user)):
        raw = user.permissions
        has_custom_permissions = bool(raw)

        allowed_by_plan = plan_modules(_plan_of(user))
        grants = effective_modules(user, raw_permissions=raw)

        # Pedidos: orders_list / orders_create valem como acesso ao módulo "orders".
        if module == "orders":
            if "orders" not in allowed_by_plan:
                raise HTTPException(
                    status_code=403,
                    detail="Este módulo não está incluído no plano atual da empresa",
                )
            all_grants = (
                {p.strip() for p in str(raw).split(",") if p.strip()}
                if has_custom_permissions
                else set(MODULES.get(user.role, set()))
            )
            if "*" in all_grants or "orders" in all_grants:
                pass
            elif write:
                if "orders_create" not in all_grants:
                    raise HTTPException(
                        status_code=403,
                        detail="Sem permissão para este módulo",
                    )
            else:
                if "orders_list" not in all_grants and "orders_create" not in all_grants:
                    raise HTTPException(
                        status_code=403,
                        detail="Sem permissão para este módulo",
                    )
        elif (
            module not in grants
            and not (
                module == "schedule"
                and any(p.startswith("schedule_") for p in grants)
            )
        ):
            # Distingue "não está no plano" de "sem permissão do usuário".
            if module not in allowed_by_plan:
                raise HTTPException(
                    status_code=403,
                    detail="Este módulo não está incluído no plano atual da empresa",
                )
            raise HTTPException(status_code=403, detail="Sem permissão para este módulo")

        if (
            write
            and module == "schedule"
            and has_custom_permissions
            and "schedule" in grants
            and not any(p.startswith("schedule_") for p in grants)
        ):
            raise HTTPException(status_code=403, detail="Sem permissão para editar este módulo")

        if (
            write
            and not has_custom_permissions
            and module in WRITE_ONLY_ROLES
            and user.role not in WRITE_ONLY_ROLES[module]
        ):
            raise HTTPException(
                status_code=403,
                detail="Você só pode consultar este módulo, não editar",
            )
        if user.must_change_password and module != "auth":
            raise HTTPException(
                status_code=403,
                detail="Altere a senha temporária antes de continuar",
            )
        return user

    return check


def main_admin(user: User = Depends(current_user)):
    """Administrador da empresa: o dono (is_owner) ou qualquer usuário ADMIN.
    Cada empresa tem o seu próprio administrador — o isolamento por tenant
    garante que ele só enxerga/gerencia usuários da própria empresa."""
    if not (getattr(user, "is_owner", False) or user.role == Role.ADMIN):
        raise HTTPException(
            status_code=403,
            detail="Apenas o Administrador da empresa pode executar esta ação",
        )
    return user


def audit(
    db,
    user,
    action,
    module,
    record_id=None,
    request: Request | None = None,
    details: str | None = None,
    username_attempted: str | None = None,
    latitude: float | None = None,
    longitude: float | None = None,
):
    from .models import AuditLog

    headers = request.headers if request else {}

    client_latitude = (
        str(latitude)
        if latitude is not None
        else headers.get('x-vercel-ip-latitude')
    )
    client_longitude = (
        str(longitude)
        if longitude is not None
        else headers.get('x-vercel-ip-longitude')
    )

    db.add(
        AuditLog(
            user_id=user.id if user else None,
            company_id=getattr(user, "company_id", None) if user else None,
            action=action,
            module=module,
            record_id=str(record_id) if record_id else None,
            ip=request.client.host if request and request.client else None,
            country=headers.get('x-vercel-ip-country'),
            region=headers.get('x-vercel-ip-country-region'),
            city=headers.get('x-vercel-ip-city'),
            latitude=client_latitude,
            longitude=client_longitude,
            username_attempted=username_attempted,
            details=details,
        )
    )
