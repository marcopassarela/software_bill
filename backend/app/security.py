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
    Role.MANAGER: {"dashboard", "routes", "vehicles", "drivers", "maintenance", "fuel", "stock", "customers", "reports", "schedule", "commercial"},
    Role.LOGISTICS: {"dashboard","routes","vehicles","drivers","fuel","customers", "commercial"},
    Role.STOCK: {"dashboard","stock", "commercial"},
    Role.DRIVER: {"routes", "commercial"},
    Role.VIEWER: {"dashboard","routes","vehicles","drivers","maintenance","fuel","stock","customers","reports","schedule", "commercial"},
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

def current_user(token: str | None = Depends(cookie), db: Session = Depends(get_db)):
    if not token:
        raise HTTPException(status_code=401, detail="Não autenticado")
    try:
        data = jwt.decode(token, get_settings().auth_secret, algorithms=["HS256"])
        user = db.get(User, int(data["sub"]))
    except Exception:
        raise HTTPException(status_code=401, detail="Sessão inválida")
    if not user or not user.active:
        raise HTTPException(status_code=401, detail="Usuário indisponível")
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
    if user.id != 1 or user.role != Role.ADMIN:
        raise HTTPException(status_code=403, detail="Apenas o Administrador Principal pode executar esta ação")
    return user


def audit(db, user, action, module, record_id=None, request: Request | None = None):
    from .models import AuditLog
    db.add(AuditLog(
        user_id=user.id if user else None,
        action=action,
        module=module,
        record_id=str(record_id) if record_id else None,
        ip=request.client.host if request and request.client else None,
    ))