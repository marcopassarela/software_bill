import enum

from datetime import date as date_type
from datetime import datetime, timezone, timedelta

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

from sqlalchemy import event
from sqlalchemy.orm import Mapped, mapped_column, Session as _OrmSession

from .database import Base


# ============================================================
# ENUMS
# ============================================================


class Role(str, enum.Enum):
    ADMIN = "ADMINISTRADOR"
    MANAGER = "GERENTE"
    LOGISTICS = "LOGÍSTICA"
    STOCK = "ESTOQUE"
    DRIVER = "MOTORISTA"
    VIEWER = "CONSULTA"
    ALMOXARIFADO = "ALMOXARIFADO"
    MONTAGEM = "MONTAGEM"
    VENDEDOR = "VENDEDOR"


class WeekStatus(str, enum.Enum):
    ATIVA = "Ativa"
    ARQUIVADA = "Arquivada"


class EntryStatus(str, enum.Enum):
    NORMAL = "Normal"
    REAGENDAMENTO = "Reagendamento"
    FECHADO = "Fechado"
    PENDENTE = "Pendente"


# ============================================================
# EMPRESA
# ============================================================


class Company(Base):
    __tablename__ = "companies"

    id: Mapped[int] = mapped_column(
        primary_key=True
    )

    name: Mapped[str] = mapped_column(
        String(160),
        nullable=False,
        default="Minha empresa",
    )

    legal_name: Mapped[str | None] = mapped_column(
        String(180),
        nullable=True,
    )

    document: Mapped[str | None] = mapped_column(
    String(14),
    nullable=True,
    unique=True,
    index=True,
    )

    email: Mapped[str | None] = mapped_column(
        String(160),
        nullable=True,
    )

    phone: Mapped[str | None] = mapped_column(
        String(30),
        nullable=True,
    )

    address: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )

    city: Mapped[str | None] = mapped_column(
        String(80),
        nullable=True,
    )

    state: Mapped[str | None] = mapped_column(
        String(2),
        nullable=True,
    )

    zip_code: Mapped[str | None] = mapped_column(
        String(12),
        nullable=True,
    )

    logo: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    # ========================================================
    # PLANO DA EMPRESA
    # ========================================================

    plan: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="essencial",
        server_default="essencial",
        index=True,
    )

    # ========================================================
    # STATUS DA ASSINATURA
    # ========================================================

    subscription_status: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default="active",
        server_default="active",
    )

    subscription_id: Mapped[str | None] = mapped_column(
        String(120),
        nullable=True,
        index=True,
    )

    current_period_start: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    current_period_end: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    active: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default="true",
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )


# ============================================================
# USUÁRIOS
# ============================================================


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(
        primary_key=True
    )

    avatar_data: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    # Empresa à qual o usuário pertence.
    company_id: Mapped[int | None] = mapped_column(
        ForeignKey(
            "companies.id",
            ondelete="CASCADE",
        ),
        nullable=True,
        index=True,
    )

    name: Mapped[str] = mapped_column(
        String(120),
        nullable=False,
    )

    username: Mapped[str] = mapped_column(
        String(60),
        unique=True,
        index=True,
        nullable=False,
    )

    email: Mapped[str | None] = mapped_column(
        String(160),
        nullable=True,
        index=True,
    )

    password_hash: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    role: Mapped[Role] = mapped_column(
        Enum(Role, name="role"),
        default=Role.VIEWER,
        nullable=False,
    )

    active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
    )

    must_change_password: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
    )

    permissions: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    token_version: Mapped[int] = mapped_column(
        Integer,
        default=0,
        server_default="0",
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    block_type: Mapped[str | None] = mapped_column(
        String(20),
        nullable=True,
    )

    blocked_until: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    block_reason: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )

    login_failures: Mapped[int] = mapped_column(
        Integer,
        default=0,
        server_default="0",
        nullable=False,
    )

    login_locked_until: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # Marca o usuário que criou/é o dono da empresa (não pode ser
    # excluído, bloqueado ou rebaixado por outro admin da mesma empresa).
    is_owner: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        server_default="false",
        nullable=False,
    )


# ============================================================
# LOG DE AUDITORIA
# ============================================================


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(
        primary_key=True
    )

    company_id: Mapped[int | None] = mapped_column(
        ForeignKey(
            "companies.id",
            ondelete="CASCADE",
        ),
        nullable=True,
        index=True,
    )

    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id"),
        nullable=True,
    )

    action: Mapped[str] = mapped_column(
        String(80),
        nullable=False,
    )

    module: Mapped[str] = mapped_column(
        String(80),
        nullable=False,
    )

    record_id: Mapped[str | None] = mapped_column(
        String(80),
        nullable=True,
    )

    ip: Mapped[str | None] = mapped_column(
        String(64),
        nullable=True,
    )

    country: Mapped[str | None] = mapped_column(
        String(80),
        nullable=True,
    )

    region: Mapped[str | None] = mapped_column(
        String(120),
        nullable=True,
    )

    city: Mapped[str | None] = mapped_column(
        String(160),
        nullable=True,
    )

    latitude: Mapped[str | None] = mapped_column(
        String(40),
        nullable=True,
    )

    longitude: Mapped[str | None] = mapped_column(
        String(40),
        nullable=True,
    )

    username_attempted: Mapped[str | None] = mapped_column(
        String(120),
        nullable=True,
    )

    details: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )


# ============================================================
# CLIENTES
# ============================================================


class Customer(Base):
    __tablename__ = "customers"

    id: Mapped[int] = mapped_column(
        primary_key=True
    )

    company_id: Mapped[int] = mapped_column(
        ForeignKey(
            "companies.id",
            ondelete="CASCADE",
        ),
        nullable=False,
        index=True,
    )

    name: Mapped[str] = mapped_column(
        String(160),
        index=True,
        nullable=False,
    )


# ============================================================
# VEÍCULOS
# ============================================================


class Vehicle(Base):
    __tablename__ = "vehicles"

    __table_args__ = (
        UniqueConstraint(
            "company_id",
            "plate",
            name="uq_vehicles_company_plate",
        ),
    )

    id: Mapped[int] = mapped_column(
        primary_key=True
    )

    company_id: Mapped[int] = mapped_column(
        ForeignKey(
            "companies.id",
            ondelete="CASCADE",
        ),
        nullable=False,
        index=True,
    )

    plate: Mapped[str] = mapped_column(
        String(12),
        index=True,
        nullable=False,
    )

    brand: Mapped[str] = mapped_column(
        String(80),
        nullable=False,
    )

    model: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    year: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )

    type: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
    )

    capacity: Mapped[float | None] = mapped_column(
        Numeric(12, 2),
        nullable=True,
    )

    average_consumption: Mapped[float | None] = mapped_column(
        Numeric(8, 2),
        nullable=True,
    )

    current_km: Mapped[float] = mapped_column(
        Numeric(12, 2),
        default=0,
        nullable=False,
    )

    fuel_type: Mapped[str | None] = mapped_column(
        String(40),
        nullable=True,
    )

    status: Mapped[str] = mapped_column(
        String(30),
        default="Disponível",
        nullable=False,
    )

    notes: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )


# ============================================================
# MOTORISTAS
# ============================================================


class Driver(Base):
    __tablename__ = "drivers"

    __table_args__ = (
        UniqueConstraint(
            "company_id",
            "email",
            name="uq_drivers_company_email",
        ),
    )

    id: Mapped[int] = mapped_column(
        primary_key=True
    )

    company_id: Mapped[int] = mapped_column(
        ForeignKey(
            "companies.id",
            ondelete="CASCADE",
        ),
        nullable=False,
        index=True,
    )

    name: Mapped[str] = mapped_column(
        String(140),
        nullable=False,
    )

    email: Mapped[str | None] = mapped_column(
        String(160),
        index=True,
        nullable=True,
    )

    phone: Mapped[str | None] = mapped_column(
        String(30),
        nullable=True,
    )

    cnh: Mapped[str | None] = mapped_column(
        String(30),
        nullable=True,
    )

    category: Mapped[str | None] = mapped_column(
        String(10),
        nullable=True,
    )

    cnh_expiry: Mapped[datetime | None] = mapped_column(
        DateTime,
        nullable=True,
    )

    vehicle_id: Mapped[int | None] = mapped_column(
        ForeignKey("vehicles.id"),
        nullable=True,
    )

    status: Mapped[str] = mapped_column(
        String(30),
        default="Ativo",
        nullable=False,
    )

    notes: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )


# ============================================================
# ROTAS
# ============================================================


class Route(Base):
    __tablename__ = "routes"

    id: Mapped[int] = mapped_column(
        primary_key=True
    )

    company_id: Mapped[int] = mapped_column(
        ForeignKey(
            "companies.id",
            ondelete="CASCADE",
        ),
        nullable=False,
        index=True,
    )

    origin: Mapped[str] = mapped_column(
        String(180),
        nullable=False,
    )

    destination: Mapped[str] = mapped_column(
        String(180),
        nullable=False,
    )

    customer_id: Mapped[int | None] = mapped_column(
        ForeignKey("customers.id"),
        nullable=True,
    )

    scheduled_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
    )

    driver_id: Mapped[int | None] = mapped_column(
        ForeignKey("drivers.id"),
        nullable=True,
    )

    vehicle_id: Mapped[int | None] = mapped_column(
        ForeignKey("vehicles.id"),
        nullable=True,
    )

    cargo_weight: Mapped[float | None] = mapped_column(
        Numeric(12, 2),
        nullable=True,
    )

    stop_count: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )

    total_km: Mapped[float | None] = mapped_column(
        Numeric(12, 2),
        nullable=True,
    )

    estimated_time: Mapped[str | None] = mapped_column(
        String(40),
        nullable=True,
    )

    estimated_fuel: Mapped[float | None] = mapped_column(
        Numeric(12, 2),
        nullable=True,
    )

    estimated_cost: Mapped[float | None] = mapped_column(
        Numeric(12, 2),
        nullable=True,
    )

    status: Mapped[str] = mapped_column(
        String(30),
        default="Planejada",
        nullable=False,
    )

    notes: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )


# ============================================================
# PARADAS DAS ROTAS
# ============================================================


class RouteStop(Base):
    __tablename__ = "route_stops"

    id: Mapped[int] = mapped_column(
        primary_key=True
    )

    company_id: Mapped[int] = mapped_column(
        ForeignKey(
            "companies.id",
            ondelete="CASCADE",
        ),
        nullable=False,
        index=True,
    )

    route_id: Mapped[int] = mapped_column(
        ForeignKey(
            "routes.id",
            ondelete="CASCADE",
        ),
        nullable=False,
    )

    customer_id: Mapped[int | None] = mapped_column(
        ForeignKey("customers.id"),
        nullable=True,
    )

    address: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    latitude: Mapped[str | None] = mapped_column(
        String(30),
        nullable=True,
    )

    longitude: Mapped[str | None] = mapped_column(
        String(30),
        nullable=True,
    )

    maps_url: Mapped[str | None] = mapped_column(
        String(500),
        nullable=True,
    )

    order: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )

    status: Mapped[str] = mapped_column(
        String(30),
        default="Planejada",
        nullable=False,
    )


# ============================================================
# MANUTENÇÃO
# ============================================================


class Maintenance(Base):
    __tablename__ = "maintenance"

    id: Mapped[int] = mapped_column(
        primary_key=True
    )

    company_id: Mapped[int] = mapped_column(
        ForeignKey(
            "companies.id",
            ondelete="CASCADE",
        ),
        nullable=False,
        index=True,
    )

    vehicle_id: Mapped[int] = mapped_column(
        ForeignKey("vehicles.id"),
        nullable=False,
    )

    type: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
    )

    description: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )

    date: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
    )

    status: Mapped[str] = mapped_column(
        String(30),
        default="Agendado",
        nullable=False,
    )

    km: Mapped[float | None] = mapped_column(
        Numeric(12, 2),
        nullable=True,
    )

    next_km: Mapped[float | None] = mapped_column(
        Numeric(12, 2),
        nullable=True,
    )

    next_date: Mapped[datetime | None] = mapped_column(
        DateTime,
        nullable=True,
    )

    value: Mapped[float | None] = mapped_column(
        Numeric(12, 2),
        nullable=True,
    )

    workshop: Mapped[str | None] = mapped_column(
        String(160),
        nullable=True,
    )

    responsible: Mapped[str | None] = mapped_column(
        String(160),
        nullable=True,
    )

    notes: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )


# ============================================================
# ABASTECIMENTO
# ============================================================


class FuelRecord(Base):
    __tablename__ = "fuel_records"

    id: Mapped[int] = mapped_column(
        primary_key=True
    )

    company_id: Mapped[int] = mapped_column(
        ForeignKey(
            "companies.id",
            ondelete="CASCADE",
        ),
        nullable=False,
        index=True,
    )

    vehicle_id: Mapped[int] = mapped_column(
        ForeignKey("vehicles.id"),
        nullable=False,
    )

    driver_id: Mapped[int | None] = mapped_column(
        ForeignKey("drivers.id"),
        nullable=True,
    )

    date: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
    )

    km: Mapped[float] = mapped_column(
        Numeric(12, 2),
        nullable=False,
    )

    liters: Mapped[float] = mapped_column(
        Numeric(10, 3),
        nullable=False,
    )

    price_per_liter: Mapped[float] = mapped_column(
        Numeric(10, 3),
        nullable=False,
    )

    total_value: Mapped[float] = mapped_column(
        Numeric(12, 2),
        nullable=False,
    )

    station: Mapped[str | None] = mapped_column(
        String(160),
        nullable=True,
    )

    fuel_type: Mapped[str | None] = mapped_column(
        String(40),
        nullable=True,
    )


# ============================================================
# PRODUTOS / ESTOQUE
# ============================================================


class Product(Base):
    __tablename__ = "products"

    __table_args__ = (
        UniqueConstraint(
            "company_id",
            "code",
            name="uq_products_company_code",
        ),
    )

    id: Mapped[int] = mapped_column(
        primary_key=True
    )

    company_id: Mapped[int] = mapped_column(
        ForeignKey(
            "companies.id",
            ondelete="CASCADE",
        ),
        nullable=False,
        index=True,
    )

    code: Mapped[str] = mapped_column(
        String(60),
        index=True,
        nullable=False,
    )

    name: Mapped[str] = mapped_column(
        String(160),
        index=True,
        nullable=False,
    )

    model: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )

    category: Mapped[str | None] = mapped_column(
        String(80),
        nullable=True,
    )

    unit: Mapped[str] = mapped_column(
        String(20),
        default="UN",
        nullable=False,
    )

    quantity: Mapped[float] = mapped_column(
        Numeric(12, 2),
        default=0,
        nullable=False,
    )

    minimum_stock: Mapped[float] = mapped_column(
        Numeric(12, 2),
        default=0,
        nullable=False,
    )

    location: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )

    supplier: Mapped[str | None] = mapped_column(
        String(160),
        nullable=True,
    )

    unit_value: Mapped[float | None] = mapped_column(
        Numeric(12, 2),
        nullable=True,
    )

    notes: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )


# ============================================================
# MOVIMENTAÇÕES DO ESTOQUE
# ============================================================


class StockMovement(Base):
    __tablename__ = "stock_movements"

    id: Mapped[int] = mapped_column(
        primary_key=True
    )

    company_id: Mapped[int] = mapped_column(
        ForeignKey(
            "companies.id",
            ondelete="CASCADE",
        ),
        nullable=False,
        index=True,
    )

    product_id: Mapped[int] = mapped_column(
        ForeignKey("products.id"),
        nullable=False,
        index=True,
    )

    type: Mapped[str] = mapped_column(
        String(12),
        nullable=False,
    )

    quantity: Mapped[float] = mapped_column(
        Numeric(12, 2),
        nullable=False,
    )

    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"),
        nullable=False,
    )

    responsible: Mapped[str | None] = mapped_column(
        String(160),
        nullable=True,
    )

    recipient: Mapped[str | None] = mapped_column(
        String(160),
        nullable=True,
    )

    sector: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )

    vehicle_id: Mapped[int | None] = mapped_column(
        ForeignKey("vehicles.id"),
        nullable=True,
    )

    observation: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    invoice: Mapped[str | None] = mapped_column(
        String(80),
        nullable=True,
    )

    unit_value: Mapped[float | None] = mapped_column(
        Numeric(12, 2),
        nullable=True,
    )


# ============================================================
# CONFIGURAÇÕES DA EMPRESA
# ============================================================


class Setting(Base):
    __tablename__ = "settings"

    __table_args__ = (
        UniqueConstraint(
            "company_id",
            "key",
            name="uq_settings_company_key",
        ),
    )

    id: Mapped[int] = mapped_column(
        primary_key=True
    )

    company_id: Mapped[int] = mapped_column(
        ForeignKey(
            "companies.id",
            ondelete="CASCADE",
        ),
        nullable=False,
        index=True,
    )

    key: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    value: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )


# ============================================================
# MÓDULO DE AGENDAMENTO
# ============================================================


class ScheduleWeek(Base):
    """
    Uma semana da agenda de instalações.
    """

    __tablename__ = "schedule_weeks"

    id: Mapped[int] = mapped_column(
        primary_key=True
    )

    company_id: Mapped[int] = mapped_column(
        ForeignKey(
            "companies.id",
            ondelete="CASCADE",
        ),
        nullable=False,
        index=True,
    )

    start_date: Mapped[date_type] = mapped_column(
        Date,
        nullable=False,
    )

    label: Mapped[str | None] = mapped_column(
        String(60),
        nullable=True,
    )

    status: Mapped[WeekStatus] = mapped_column(
        Enum(WeekStatus),
        default=WeekStatus.ATIVA,
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    archived_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )


# ============================================================
# VAGAS / SLOTS DAS ROTAS
# ============================================================


class RouteSlot(Base):
    __tablename__ = "route_slots"

    id: Mapped[int] = mapped_column(
        primary_key=True
    )

    company_id: Mapped[int] = mapped_column(
        ForeignKey(
            "companies.id",
            ondelete="CASCADE",
        ),
        nullable=False,
        index=True,
    )

    week_id: Mapped[int] = mapped_column(
        ForeignKey(
            "schedule_weeks.id",
            ondelete="CASCADE",
        ),
        nullable=False,
    )

    date: Mapped[date_type] = mapped_column(
    Date,
    index=True,
    nullable=False,
    )

    region_code: Mapped[str] = mapped_column(
        String(10),
        nullable=False,
    )

    route_label: Mapped[str | None] = mapped_column(
        String(60),
        nullable=True,
    )

    total_slots: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )

    driver_id: Mapped[int | None] = mapped_column(
        ForeignKey("drivers.id"),
        nullable=True,
    )

    second_driver_id: Mapped[int | None] = mapped_column(
        ForeignKey("drivers.id"),
        nullable=True,
    )

    vehicle_id: Mapped[int | None] = mapped_column(
        ForeignKey("vehicles.id"),
        nullable=True,
    )

    closed: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )

    notes: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )


# ============================================================
# CLIENTES AGENDADOS
# ============================================================


class ScheduleEntry(Base):
    """
    Um cliente agendado numa vaga da rota.
    """

    __tablename__ = "schedule_entries"

    id: Mapped[int] = mapped_column(
        primary_key=True
    )

    company_id: Mapped[int] = mapped_column(
        ForeignKey(
            "companies.id",
            ondelete="CASCADE",
        ),
        nullable=False,
        index=True,
    )

    route_slot_id: Mapped[int] = mapped_column(
        ForeignKey(
            "route_slots.id",
            ondelete="CASCADE",
        ),
        nullable=False,
    )

    position: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )

    service_description: Mapped[str] = mapped_column(
        String(200),
        nullable=False,
    )

    client_name: Mapped[str] = mapped_column(
        String(120),
        nullable=False,
    )

    phone: Mapped[str | None] = mapped_column(
        String(30),
        nullable=True,
    )

    location_link: Mapped[str | None] = mapped_column(
        String(300),
        nullable=True,
    )

    no_comanda: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )

    comanda: Mapped[str | None] = mapped_column(
        String(30),
        nullable=True,
    )

    cooperativa: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )

    cooperativa_nome: Mapped[str | None] = mapped_column(
        String(120),
        nullable=True,
    )

    pago: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )

    slots_consumed: Mapped[int] = mapped_column(
        Integer,
        default=1,
        nullable=False,
    )

    status: Mapped[EntryStatus] = mapped_column(
        Enum(EntryStatus),
        default=EntryStatus.NORMAL,
        nullable=False,
    )

    observation: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )


# ============================================================
# EXTRAS DO AGENDAMENTO
# ============================================================


class ScheduleExtra(Base):
    __tablename__ = "schedule_extras"

    id: Mapped[int] = mapped_column(
        primary_key=True
    )

    company_id: Mapped[int] = mapped_column(
        ForeignKey(
            "companies.id",
            ondelete="CASCADE",
        ),
        nullable=False,
        index=True,
    )

    entry_id: Mapped[int] = mapped_column(
        ForeignKey(
            "schedule_entries.id",
            ondelete="CASCADE",
        ),
        nullable=False,
    )

    description: Mapped[str] = mapped_column(
        String(200),
        nullable=False,
    )

    observation: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    status: Mapped[EntryStatus] = mapped_column(
        Enum(EntryStatus),
        default=EntryStatus.NORMAL,
        nullable=False,
    )


# ============================================================
# VERSÃO DO AGENDAMENTO (para polling barato no frontend)
# ============================================================


class ScheduleVersion(Base):
    """
    Um contador por empresa, incrementado automaticamente sempre que
    qualquer registro de agendamento (semana, rota, cliente ou extra)
    é criado, alterado ou removido.

    O frontend consulta GET /schedule/version a cada 15s (query muito
    barata: leitura de uma única linha por PK) e só busca o payload
    completo em /schedule/weeks quando esse número muda. Isso evita
    reprocessar e retransmitir toda a agenda a cada poll quando nada
    mudou, reduzindo bastante o consumo de compute no banco.
    """

    __tablename__ = "schedule_versions"

    company_id: Mapped[int] = mapped_column(
        ForeignKey(
            "companies.id",
            ondelete="CASCADE",
        ),
        primary_key=True,
    )

    version: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=1,
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )


# Modelos cuja criação/edição/remoção deve contar como "mudança" na agenda.
_SCHEDULE_WATCHED_MODELS = (
    ScheduleWeek,
    RouteSlot,
    ScheduleEntry,
    ScheduleExtra,
)


@event.listens_for(_OrmSession, "before_commit")
def _bump_schedule_version_on_commit(session: _OrmSession) -> None:
    """
    Antes de cada commit, verifica se algum objeto de agendamento foi
    criado/alterado/removido nesta sessão e, se sim, incrementa (ou cria)
    o contador ScheduleVersion da(s) empresa(s) afetada(s), dentro da
    mesma transação. Assim nenhum endpoint precisa lembrar de "avisar"
    manualmente — qualquer escrita nessas tabelas já atualiza a versão.
    """

    touched_company_ids: set[int] = set()

    for obj in list(session.new) + list(session.dirty) + list(session.deleted):
        if isinstance(obj, _SCHEDULE_WATCHED_MODELS):
            company_id = getattr(obj, "company_id", None)
            if company_id is not None:
                touched_company_ids.add(company_id)

    if not touched_company_ids:
        return

    for company_id in touched_company_ids:
        row = session.get(ScheduleVersion, company_id)
        if row is None:
            session.add(
                ScheduleVersion(
                    company_id=company_id,
                    version=1,
                )
            )
        else:
            row.version = (row.version or 0) + 1


# ============================================================
# PRODUÇÃO
# ============================================================


class ProductionRecord(Base):
    """
    Lançamento de produção (fábrica) ou montagem.
    """

    __tablename__ = "production_records"

    id: Mapped[int] = mapped_column(
        primary_key=True
    )

    company_id: Mapped[int] = mapped_column(
        ForeignKey(
            "companies.id",
            ondelete="CASCADE",
        ),
        nullable=False,
        index=True,
    )

    # "fabricacao" | "montagem"
    kind: Mapped[str] = mapped_column(
        String(20),
        index=True,
        nullable=False,
    )

    production_date: Mapped[date_type] = mapped_column(
        Date,
        index=True,
        nullable=False,
    )

    model: Mapped[str] = mapped_column(
        String(80),
        nullable=False,
    )

    quantity: Mapped[float] = mapped_column(
        Numeric(12, 2),
        default=0,
        nullable=False,
    )

    # Só faz sentido em montagem.
    emergency_altered: Mapped[float] = mapped_column(
        Numeric(12, 2),
        default=0,
        nullable=False,
    )

    notes: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id"),
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )


# ============================================================
# RECUPERAÇÃO DE SENHA
# ============================================================


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    id: Mapped[int] = mapped_column(
        primary_key=True
    )

    user_id: Mapped[int] = mapped_column(
        ForeignKey(
            "users.id",
            ondelete="CASCADE",
        ),
        nullable=False,
    )

    token_hash: Mapped[str] = mapped_column(
        String(64),
        unique=True,
        index=True,
        nullable=False,
    )

    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )

    used_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )


# ============================================================
# PEDIDOS
# ============================================================


class Order(Base):
    """
    Pedido da empresa.
    """

    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(
        primary_key=True
    )

    company_id: Mapped[int] = mapped_column(
        ForeignKey(
            "companies.id",
            ondelete="CASCADE",
        ),
        nullable=False,
        index=True,
    )

    model: Mapped[str] = mapped_column(
        String(120),
        nullable=False,
    )

    quality: Mapped[str | None] = mapped_column(
        String(80),
        nullable=True,
    )

    # Cabeamento
    cabling: Mapped[str | None] = mapped_column(
        String(120),
        nullable=True,
    )

    # Disjuntor
    breaker: Mapped[str | None] = mapped_column(
        String(80),
        nullable=True,
    )

    # Altura
    height: Mapped[str | None] = mapped_column(
        String(40),
        nullable=True,
    )

    quantity: Mapped[float] = mapped_column(
        Numeric(12, 2),
        default=1,
        nullable=False,
    )

    order_date: Mapped[date_type] = mapped_column(
        Date,
        index=True,
        nullable=False,
    )

    # Data de saída
    ship_date: Mapped[date_type | None] = mapped_column(
        Date,
        index=True,
        nullable=True,
    )

    status: Mapped[str] = mapped_column(
        String(20),
        default="pendente",
        index=True,
        nullable=False,
    )

    # Mantido como campo de texto por compatibilidade
    # com o funcionamento atual do sistema.
    branch: Mapped[str | None] = mapped_column(
        String(120),
        nullable=True,
    )

    notes: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    created_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id"),
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )