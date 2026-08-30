import enum
from datetime import datetime, date
from datetime import datetime, date as DateOnly
from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .database import Base


class Role(str, enum.Enum):
    ADMIN = "ADMINISTRADOR"
    MANAGER = "GERENTE"
    LOGISTICS = "LOGÍSTICA"
    STOCK = "ESTOQUE"
    DRIVER = "MOTORISTA"
    VIEWER = "CONSULTA"
    ALMOXARIFADO = "ALMOXARIFADO"
    VENDEDOR = "VENDEDOR"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    username: Mapped[str] = mapped_column(String(60), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[Role] = mapped_column(
        Enum(Role, name="role"),
        default=Role.VIEWER,
    )
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    must_change_password: Mapped[bool] = mapped_column(Boolean, default=True)
    permissions: Mapped[str | None] = mapped_column(Text, nullable=True)
    token_version: Mapped[int] = mapped_column(
        Integer,
        default=0,
        server_default="0",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    block_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    blocked_until: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    block_reason: Mapped[str | None] = mapped_column(String(255), nullable=True)




class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    action: Mapped[str] = mapped_column(String(80))
    module: Mapped[str] = mapped_column(String(80))
    record_id: Mapped[str | None] = mapped_column(String(80))
    ip: Mapped[str | None] = mapped_column(String(64))
    country: Mapped[str | None] = mapped_column(String(80), nullable=True)
    region: Mapped[str | None] = mapped_column(String(120), nullable=True)
    city: Mapped[str | None] = mapped_column(String(160), nullable=True)
    latitude: Mapped[str | None] = mapped_column(String(40), nullable=True)
    longitude: Mapped[str | None] = mapped_column(String(40), nullable=True)
    username_attempted: Mapped[str | None] = mapped_column(String(120), nullable=True)
    details: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class Customer(Base):
    __tablename__ = "customers"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(160), index=True)
    document: Mapped[str | None] = mapped_column(String(24))
    phone: Mapped[str | None] = mapped_column(String(30))
    address: Mapped[str | None] = mapped_column(String(255))
    city: Mapped[str | None] = mapped_column(String(80))
    state: Mapped[str | None] = mapped_column(String(2))
    zip_code: Mapped[str | None] = mapped_column(String(12))
    latitude: Mapped[str | None] = mapped_column(String(30))
    longitude: Mapped[str | None] = mapped_column(String(30))
    maps_url: Mapped[str | None] = mapped_column(String(500))
    notes: Mapped[str | None] = mapped_column(Text)


class Vehicle(Base):
    __tablename__ = "vehicles"

    id: Mapped[int] = mapped_column(primary_key=True)
    plate: Mapped[str] = mapped_column(String(12), unique=True, index=True)
    brand: Mapped[str] = mapped_column(String(80))
    model: Mapped[str] = mapped_column(String(100))
    year: Mapped[int | None] = mapped_column(Integer)
    type: Mapped[str | None] = mapped_column(String(50))
    capacity: Mapped[float | None] = mapped_column(Numeric(12, 2))
    average_consumption: Mapped[float | None] = mapped_column(Numeric(8, 2))
    current_km: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    fuel_type: Mapped[str | None] = mapped_column(String(40))
    status: Mapped[str] = mapped_column(String(30), default="Disponível")
    notes: Mapped[str | None] = mapped_column(Text)


class Driver(Base):
    __tablename__ = "drivers"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(140))
    cpf: Mapped[str | None] = mapped_column(String(14), unique=True, nullable=True)
    phone: Mapped[str | None] = mapped_column(String(30))
    cnh: Mapped[str | None] = mapped_column(String(30), nullable=True)
    category: Mapped[str | None] = mapped_column(String(10))
    cnh_expiry: Mapped[datetime | None] = mapped_column(DateTime)
    vehicle_id: Mapped[int | None] = mapped_column(ForeignKey("vehicles.id"))
    status: Mapped[str] = mapped_column(String(30), default="Ativo")
    notes: Mapped[str | None] = mapped_column(Text)


class Route(Base):
    __tablename__ = "routes"

    id: Mapped[int] = mapped_column(primary_key=True)
    origin: Mapped[str] = mapped_column(String(180))
    destination: Mapped[str] = mapped_column(String(180))
    customer_id: Mapped[int | None] = mapped_column(ForeignKey("customers.id"))
    scheduled_at: Mapped[datetime] = mapped_column(DateTime)
    driver_id: Mapped[int | None] = mapped_column(ForeignKey("drivers.id"))
    vehicle_id: Mapped[int | None] = mapped_column(ForeignKey("vehicles.id"))
    cargo_weight: Mapped[float | None] = mapped_column(Numeric(12, 2))
    stop_count: Mapped[int] = mapped_column(Integer, default=0)
    total_km: Mapped[float | None] = mapped_column(Numeric(12, 2))
    estimated_time: Mapped[str | None] = mapped_column(String(40))
    estimated_fuel: Mapped[float | None] = mapped_column(Numeric(12, 2))
    estimated_cost: Mapped[float | None] = mapped_column(Numeric(12, 2))
    status: Mapped[str] = mapped_column(String(30), default="Planejada")
    notes: Mapped[str | None] = mapped_column(Text)


class RouteStop(Base):
    __tablename__ = "route_stops"

    id: Mapped[int] = mapped_column(primary_key=True)
    route_id: Mapped[int] = mapped_column(ForeignKey("routes.id", ondelete="CASCADE"))
    customer_id: Mapped[int | None] = mapped_column(ForeignKey("customers.id"))
    address: Mapped[str] = mapped_column(String(255))
    latitude: Mapped[str | None] = mapped_column(String(30))
    longitude: Mapped[str | None] = mapped_column(String(30))
    maps_url: Mapped[str | None] = mapped_column(String(500))
    order: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(30), default="Planejada")


class Maintenance(Base):
    __tablename__ = "maintenance"

    id: Mapped[int] = mapped_column(primary_key=True)
    vehicle_id: Mapped[int] = mapped_column(ForeignKey("vehicles.id"))
    type: Mapped[str] = mapped_column(String(30))
    description: Mapped[str] = mapped_column(Text)
    date: Mapped[datetime] = mapped_column(DateTime)
    status: Mapped[str] = mapped_column(String(30), default="Agendado")
    km: Mapped[float | None] = mapped_column(Numeric(12, 2))
    next_km: Mapped[float | None] = mapped_column(Numeric(12, 2))
    next_date: Mapped[datetime | None] = mapped_column(DateTime)
    value: Mapped[float | None] = mapped_column(Numeric(12, 2))
    workshop: Mapped[str | None] = mapped_column(String(160))
    responsible: Mapped[str | None] = mapped_column(String(160))
    notes: Mapped[str | None] = mapped_column(Text)


class FuelRecord(Base):
    __tablename__ = "fuel_records"

    id: Mapped[int] = mapped_column(primary_key=True)
    vehicle_id: Mapped[int] = mapped_column(ForeignKey("vehicles.id"))
    driver_id: Mapped[int | None] = mapped_column(ForeignKey("drivers.id"))
    date: Mapped[datetime] = mapped_column(DateTime)
    km: Mapped[float] = mapped_column(Numeric(12, 2))
    liters: Mapped[float] = mapped_column(Numeric(10, 3))
    price_per_liter: Mapped[float] = mapped_column(Numeric(10, 3))
    total_value: Mapped[float] = mapped_column(Numeric(12, 2))
    station: Mapped[str | None] = mapped_column(String(160))
    fuel_type: Mapped[str | None] = mapped_column(String(40))


class Product(Base):
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(60), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(160), index=True)
    model: Mapped[str | None] = mapped_column(String(100))
    category: Mapped[str | None] = mapped_column(String(80))
    unit: Mapped[str] = mapped_column(String(20), default="UN")
    quantity: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    minimum_stock: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    location: Mapped[str | None] = mapped_column(String(100))
    supplier: Mapped[str | None] = mapped_column(String(160))
    unit_value: Mapped[float | None] = mapped_column(Numeric(12, 2))
    notes: Mapped[str | None] = mapped_column(Text)

class CommercialProduct(Base):
    __tablename__ = "commercial_products"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str | None] = mapped_column(String(60), nullable=True)
    name: Mapped[str] = mapped_column(String(160))
    price: Mapped[float] = mapped_column(Numeric(12, 2))
    unit: Mapped[str | None] = mapped_column(String(20), nullable=True)
    category: Mapped[str | None] = mapped_column(String(80), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )



class StockMovement(Base):
    __tablename__ = "stock_movements"

    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), index=True)
    type: Mapped[str] = mapped_column(String(12))
    quantity: Mapped[float] = mapped_column(Numeric(12, 2))
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    responsible: Mapped[str | None] = mapped_column(String(160))
    recipient: Mapped[str | None] = mapped_column(String(160))
    sector: Mapped[str | None] = mapped_column(String(100))
    vehicle_id: Mapped[int | None] = mapped_column(ForeignKey("vehicles.id"))
    observation: Mapped[str | None] = mapped_column(Text)
    invoice: Mapped[str | None] = mapped_column(String(80))
    unit_value: Mapped[float | None] = mapped_column(Numeric(12, 2))


class Setting(Base):
    __tablename__ = "settings"

    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value: Mapped[str | None] = mapped_column(Text)


# ============================================================
# MÓDULO DE AGENDAMENTO (instalações / postes)
# ============================================================


class WeekStatus(str, enum.Enum):
    ATIVA = "Ativa"
    ARQUIVADA = "Arquivada"


class EntryStatus(str, enum.Enum):
    NORMAL = "Normal"
    REAGENDAMENTO = "Reagendamento"
    FECHADO = "Fechado"
    PENDENTE = "Pendente"


class ScheduleWeek(Base):
    """Uma das 3 semanas ativas da agenda de instalações. Ao arquivar vira backup consultável."""
    __tablename__ = "schedule_weeks"

    id: Mapped[int] = mapped_column(primary_key=True)
    start_date: Mapped[date] = mapped_column(Date)
    label: Mapped[str | None] = mapped_column(String(60))
    status: Mapped[WeekStatus] = mapped_column(Enum(WeekStatus), default=WeekStatus.ATIVA)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class RouteSlot(Base):
    __tablename__ = "route_slots"

    id: Mapped[int] = mapped_column(primary_key=True)
    week_id: Mapped[int] = mapped_column(
        ForeignKey("schedule_weeks.id", ondelete="CASCADE")
    )
    date: Mapped["date"] = mapped_column(Date, index=True)  # aspas resolvem o Pylance
    region_code: Mapped[str] = mapped_column(String(10))
    route_label: Mapped[str | None] = mapped_column(String(60))
    total_slots: Mapped[int] = mapped_column(Integer, default=0)
    driver_id: Mapped[int | None] = mapped_column(ForeignKey("drivers.id"))
    second_driver_id: Mapped[int | None] = mapped_column(ForeignKey("drivers.id"))
    vehicle_id: Mapped[int | None] = mapped_column(ForeignKey("vehicles.id"))
    closed: Mapped[bool] = mapped_column(Boolean, default=False)
    notes: Mapped[str | None] = mapped_column(Text)


class ScheduleEntry(Base):
    """Um cliente agendado numa vaga da rota — consome 1 ou mais vagas."""
    __tablename__ = "schedule_entries"

    id: Mapped[int] = mapped_column(primary_key=True)
    route_slot_id: Mapped[int] = mapped_column(ForeignKey("route_slots.id", ondelete="CASCADE"))
    position: Mapped[int] = mapped_column(Integer)
    service_description: Mapped[str] = mapped_column(String(200))
    client_name: Mapped[str] = mapped_column(String(120))
    phone: Mapped[str | None] = mapped_column(String(30))
    location_link: Mapped[str | None] = mapped_column(String(300))
    no_comanda: Mapped[bool] = mapped_column(Boolean, default=False)
    comanda: Mapped[str | None] = mapped_column(String(30))
    cooperativa: Mapped[bool] = mapped_column(Boolean, default=False)
    cooperativa_nome: Mapped[str | None] = mapped_column(String(120))
    pago: Mapped[bool] = mapped_column(Boolean, default=False)
    slots_consumed: Mapped[int] = mapped_column(Integer, default=1)
    status: Mapped[EntryStatus] = mapped_column(Enum(EntryStatus), default=EntryStatus.NORMAL)
    observation: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class ScheduleExtra(Base):
    """Item adicional dentro do mesmo cliente (ex: cavalete de água).
    NÃO desconta vaga nova — é um sub-item de um ScheduleEntry."""
    __tablename__ = "schedule_extras"

    id: Mapped[int] = mapped_column(primary_key=True)
    entry_id: Mapped[int] = mapped_column(ForeignKey("schedule_entries.id", ondelete="CASCADE"))
    description: Mapped[str] = mapped_column(String(200))
    observation: Mapped[str | None] = mapped_column(Text)
    status: Mapped[EntryStatus] = mapped_column(Enum(EntryStatus), default=EntryStatus.NORMAL)