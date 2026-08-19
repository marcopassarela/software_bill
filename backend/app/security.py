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
MODULES = {Role.ADMIN: {"*"}, Role.MANAGER: {"dashboard","routes","vehicles","drivers","maintenance","fuel","stock","customers","reports"}, Role.LOGISTICS:{"dashboard","routes","vehicles","drivers","fuel","customers"}, Role.STOCK:{"dashboard","stock"}, Role.DRIVER:{"routes"}, Role.VIEWER:{"dashboard","routes","vehicles","drivers","maintenance","fuel","stock","customers","reports"}}
def hash_password(password: str): return password_hash.hash(password)
def verify_password(password: str, hashed: str): return password_hash.verify(password, hashed)
def token_for(user: User):
    s=get_settings(); return jwt.encode({"sub":str(user.id),"exp":datetime.now(timezone.utc)+timedelta(minutes=s.access_token_minutes)},s.auth_secret,algorithm="HS256")
def current_user(token: str|None=Depends(cookie), db: Session=Depends(get_db)):
    if not token: raise HTTPException(status_code=401,detail="Não autenticado")
    try: data=jwt.decode(token,get_settings().auth_secret,algorithms=["HS256"]); user=db.get(User,int(data["sub"]))
    except Exception: raise HTTPException(status_code=401,detail="Sessão inválida")
    if not user or not user.active: raise HTTPException(status_code=401,detail="Usuário indisponível")
    return user
def require(module: str, write=False):
    def check(user: User=Depends(current_user)):
        grants=set((user.permissions or "").split(",")) if user.permissions else MODULES[user.role]
        if "*" not in grants and module not in grants: raise HTTPException(status_code=403,detail="Sem permissão para este módulo")
        if user.must_change_password and module != "auth": raise HTTPException(status_code=403,detail="Altere a senha temporária antes de continuar")
        return user
    return check
def main_admin(user: User=Depends(current_user)):
    if user.id != 1 or user.role != Role.ADMIN: raise HTTPException(status_code=403,detail="Apenas o Administrador Principal pode executar esta ação")
    return user
def audit(db, user, action, module, record_id=None, request: Request|None=None):
    from .models import AuditLog
    db.add(AuditLog(user_id=user.id if user else None,action=action,module=module,record_id=str(record_id) if record_id else None,ip=request.client.host if request and request.client else None))

