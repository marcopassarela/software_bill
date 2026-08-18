from datetime import datetime
from typing import Any
from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from .config import get_settings
from .database import Base, engine, get_db
from .models import *
from .security import audit, current_user, hash_password, main_admin, require, token_for, verify_password

app=FastAPI(title="Gestão Logística API",version="1.0.0")
settings=get_settings(); limiter=Limiter(key_func=get_remote_address); app.state.limiter=limiter
app.add_exception_handler(RateLimitExceeded, lambda r,e: Response('{"detail":"Muitas tentativas. Aguarde."}',429,media_type="application/json"))
app.add_middleware(CORSMiddleware,allow_origins=settings.cors_origins.split(","),allow_credentials=True,allow_methods=["*"],allow_headers=["*"])
@app.on_event("startup")
def seed():
    Base.metadata.create_all(engine) # Local convenience; production uses Alembic.
    with Session(engine) as db:
        if not db.scalar(select(User).where(User.username=="user")):
            db.add(User(name="Administrador Principal",username="user",password_hash=hash_password("user123"),role=Role.ADMIN,must_change_password=True)); db.commit()
class Login(BaseModel): username:str=Field(min_length=1,max_length=60); password:str=Field(min_length=1,max_length=200)
class PasswordChange(BaseModel): current_password:str=Field(min_length=1,max_length=200); new_password:str=Field(min_length=12,max_length=200)
class UserCreate(BaseModel): name:str; username:str; password:str=Field(min_length=12); role:Role; permissions:str|None=None
class Payload(BaseModel): data:dict[str,Any]
class Movement(BaseModel): product_id:int; quantity:float=Field(gt=0); responsible:str|None=None; sector:str|None=None; vehicle_id:int|None=None; observation:str|None=None; invoice:str|None=None; unit_value:float|None=None
def serialize(o):
    d={c.name:getattr(o,c.name) for c in o.__table__.columns}
    return {k:(v.value if hasattr(v,'value') else v.isoformat() if isinstance(v,datetime) else float(v) if hasattr(v,'as_tuple') else v) for k,v in d.items()}
def serialize_user(o):
    d = serialize(o)
    d.pop("password_hash", None)
    return d
def model_data(model,data): return {c.name:v for c in model.__table__.columns for k,v in data.items() if k==c.name and k not in {"id","quantity","created_at","occurred_at"}}
@app.get("/health")
def health(): return {"status":"ok"}
@app.post("/auth/login")
@limiter.limit("5/minute")
def login(body:Login,request:Request,response:Response,db:Session=Depends(get_db)):
    u=db.scalar(select(User).where(User.username==body.username))
    if not u or not u.active or not verify_password(body.password,u.password_hash):
        audit(db,u,"LOGIN_INVÁLIDO","auth",request=request); db.commit(); raise HTTPException(401,"Usuário ou senha inválidos")
    audit(db,u,"LOGIN","auth",request=request); db.commit(); response.set_cookie("gl_session",token_for(u),httponly=True,secure=settings.cookie_secure,samesite="lax",max_age=settings.access_token_minutes*60,path="/")
    return {"user":serialize_user(u)}
@app.post("/auth/logout")
def logout(response:Response,request:Request,user:User=Depends(current_user),db:Session=Depends(get_db)):
    audit(db,user,"LOGOUT","auth",request=request); db.commit(); response.delete_cookie("gl_session",path="/"); return {"ok":True}
@app.get("/auth/me")
def me(user:User=Depends(current_user)): return serialize_user(user)
@app.post("/auth/change-password")
def change_password(body:PasswordChange,request:Request,user:User=Depends(current_user),db:Session=Depends(get_db)):
    if not verify_password(body.current_password,user.password_hash): raise HTTPException(400,"Senha atual incorreta")
    user.password_hash=hash_password(body.new_password); user.must_change_password=False; audit(db,user,"ALTERAÇÃO_DE_SENHA","auth",user.id,request); db.commit(); return {"ok":True}
@app.get("/users")
def users(_:User=Depends(main_admin),db:Session=Depends(get_db)): return [serialize_user(x) for x in db.scalars(select(User).order_by(User.name)).all()]
@app.post("/users")
def create_user(body:UserCreate,request:Request,admin:User=Depends(main_admin),db:Session=Depends(get_db)):
    u=User(name=body.name,username=body.username,password_hash=hash_password(body.password),role=body.role,permissions=body.permissions,must_change_password=True); db.add(u)
    try: db.flush()
    except IntegrityError: db.rollback(); raise HTTPException(409,"Usuário já existe")
    audit(db,admin,"CRIAÇÃO_DE_USUÁRIO","users",u.id,request);db.commit();return serialize_user(u)
@app.patch("/users/{user_id}")
def update_user(user_id:int,body:Payload,request:Request,admin:User=Depends(main_admin),db:Session=Depends(get_db)):
    u=db.get(User,user_id)
    if not u: raise HTTPException(404,"Usuário não encontrado")
    for k in ("name","role","active","permissions"):
        if k in body.data: setattr(u,k,body.data[k])
    audit(db,admin,"ALTERAÇÃO_DE_USUÁRIO","users",u.id,request);db.commit();return serialize_user(u)
@app.get("/audit")
def logs(_:User=Depends(main_admin),db:Session=Depends(get_db)): return [serialize(x) for x in db.scalars(select(AuditLog).order_by(AuditLog.created_at.desc()).limit(300)).all()]

RESOURCES={"customers":(Customer,"customers"),"vehicles":(Vehicle,"vehicles"),"drivers":(Driver,"drivers"),"routes":(Route,"routes"),"route-stops":(RouteStop,"routes"),"maintenance":(Maintenance,"maintenance"),"fuel":(FuelRecord,"fuel"),"products":(Product,"stock"),"settings":(Setting,"settings")}
@app.get("/{resource}")
def list_resource(resource:str,user:User=Depends(current_user),db:Session=Depends(get_db)):
    if resource not in RESOURCES: raise HTTPException(404)
    model,module=RESOURCES[resource]; require(module)(user); return [serialize(x) for x in db.scalars(select(model).limit(500)).all()]
@app.post("/{resource}")
def add_resource(resource:str,body:Payload,request:Request,user:User=Depends(current_user),db:Session=Depends(get_db)):
    if resource not in RESOURCES: raise HTTPException(404)
    model,module=RESOURCES[resource]; require(module)(user); x=model(**model_data(model,body.data));db.add(x);db.flush();audit(db,user,"CADASTRO",module,x.id if hasattr(x,'id') else None,request);db.commit();return serialize(x)
@app.patch("/{resource}/{record_id}")
def edit_resource(resource:str,record_id:int,body:Payload,request:Request,user:User=Depends(current_user),db:Session=Depends(get_db)):
    if resource not in RESOURCES: raise HTTPException(404)
    model,module=RESOURCES[resource]; require(module)(user);x=db.get(model,record_id)
    if not x: raise HTTPException(404)
    for k,v in model_data(model,body.data).items(): setattr(x,k,v)
    audit(db,user,"ALTERAÇÃO",module,record_id,request);db.commit();return serialize(x)
@app.get("/stock/movements")
def movements(user:User=Depends(current_user),db:Session=Depends(get_db)):
    require("stock")(user);return [serialize(x) for x in db.scalars(select(StockMovement).order_by(StockMovement.occurred_at.desc()).limit(500)).all()]
@app.post("/stock/{kind}")
def stock(kind:str,body:Movement,request:Request,user:User=Depends(current_user),db:Session=Depends(get_db)):
    if kind not in ("entry","output"): raise HTTPException(404)
    require("stock")(user)
    # SELECT FOR UPDATE makes concurrent removals serialize on PostgreSQL.
    product=db.scalar(select(Product).where(Product.id==body.product_id).with_for_update())
    if not product: raise HTTPException(404,"Produto não encontrado")
    if kind=="output" and product.quantity<body.quantity: raise HTTPException(409,"Estoque insuficiente")
    product.quantity=product.quantity+body.quantity if kind=="entry" else product.quantity-body.quantity
    m=StockMovement(product_id=product.id,type="ENTRADA" if kind=="entry" else "SAÍDA",quantity=body.quantity,user_id=user.id,responsible=body.responsible,sector=body.sector,vehicle_id=body.vehicle_id,observation=body.observation,invoice=body.invoice,unit_value=body.unit_value);db.add(m);db.flush();audit(db,user,m.type,"stock",m.id,request);db.commit();return {"movement":serialize(m),"quantity":float(product.quantity)}
@app.get("/dashboard")
def dashboard(user:User=Depends(current_user),db:Session=Depends(get_db)):
    require("dashboard")(user); today=datetime.now().date()
    count=lambda q: db.scalar(q) or 0
    return {"available":count(select(func.count()).select_from(Vehicle).where(Vehicle.status=="Disponível")),"on_route":count(select(func.count()).select_from(Vehicle).where(Vehicle.status=="Em rota")),"maintenance":count(select(func.count()).select_from(Vehicle).where(Vehicle.status=="Manutenção")),"routes_today":count(select(func.count()).select_from(Route).where(func.date(Route.scheduled_at)==today)),"products":count(select(func.count()).select_from(Product)),"low_stock":count(select(func.count()).select_from(Product).where(Product.quantity<=Product.minimum_stock)),"fuel_cost":float(count(select(func.coalesce(func.sum(FuelRecord.total_value),0))))}