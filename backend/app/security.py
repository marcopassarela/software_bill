from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import APIKeyCookie
from pwdlib import PasswordHash
from sqlalchemy.orm import Session
from .config import get_settings
from .database import get_db
from .models import User, Role

password_hash = PasswordHash.recommended()
cookie = APIKeyCookie(name="gl_session", auto_error=False)

MODULES = {
    Role.ADMIN: {"*"},
    Role.MANAGER: {
        "dashboard", "routes", "vehicles", "drivers", "maintenance", "fuel",
        "stock", "customers", "reports", "schedule", "commercial", "production", "assembly",
    },
    Role.LOGISTICS: {"dashboard", "routes", "vehicles", "drivers", "fuel", "customers", "commercial"},
    Role.STOCK: {"dashboard", "stock", "commercial"},
    Role.DRIVER: {"routes", "commercial"},
    Role.VIEWER: {
        "dashboard", "routes", "vehicles", "drivers", "maintenance", "fuel",
        "stock", "customers", "reports", "schedule", "commercial",
    },
    Role.MONTAGEM: {"dashboard", "production", "assembly"},
}

# Módulos onde view e edição são diferentes: só os perfis listados aqui podem
# criar/editar/excluir. Quem tem o módulo em MODULES mas não está aqui só
# consegue ler (GET). Perfis com permissões customizadas (user.permissions
# preenchido) continuam com acesso total de leitura/escrita aos módulos
# liberados, como já era antes.
WRITE_ONLY_ROLES = {
    "schedule": {Role.ADMIN, Role.MANAGER},
}


def hash_password(password: str):
    return password_hash.hash(password)


def verify_password(password: str, hashed: str):
    return password_hash.verify(password, hashed)


def token_for(user: User):
    s = get_settings()
    return jwt.encode(
        {
            "sub": str(user.id),
            "ver": int(getattr(user, "token_version", 0) or 0),
            "exp": datetime.now(timezone.utc) + timedelta(minutes=s.access_token_minutes),
        },
        s.auth_secret,
        algorithm="HS256",
    )

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
        user = db.get(User, int(data["sub"]))
    except Exception:
        raise HTTPException(status_code=401, detail="Sessão inválida")
    if not user:
        raise HTTPException(status_code=401, detail="Usuário indisponível")

    was_inactive = not user.active
    still_blocked = apply_auto_unblock(user)
    if was_inactive and not still_blocked:
        # auto-liberou scheduled
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
    return user


def require(module: str, write: bool = False):
    def check(user: User = Depends(current_user)):
        has_custom_permissions = bool(user.permissions)
        grants = set((user.permissions or "").split(",")) if has_custom_permissions else MODULES[user.role]
        if "*" not in grants and module not in grants:
            raise HTTPException(status_code=403, detail="Sem permissão para este módulo")
        if (
            write
            and not has_custom_permissions
            and module in WRITE_ONLY_ROLES
            and user.role not in WRITE_ONLY_ROLES[module]
        ):
            raise HTTPException(status_code=403, detail="Você só pode consultar este módulo, não editar")
        if user.must_change_password and module != "auth":
            raise HTTPException(status_code=403, detail="Altere a senha temporária antes de continuar")
        return user
    return check


def main_admin(user: User = Depends(current_user)):
    if user.id != 1 or user.role not in (Role.ADMIN, Role.MONTAGEM):
        raise HTTPException(
            status_code=403,
            detail="Apenas o Administrador Principal pode executar esta ação"
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

    # Usa a localização autorizada pelo navegador quando existir.
    # Se não existir, utiliza a localização aproximada fornecida pela Vercel.
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