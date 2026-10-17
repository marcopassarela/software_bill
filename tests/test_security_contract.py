from backend.app.security import MODULES
from backend.app.models import Role, StockMovement


def test_stock_user_has_no_user_admin_permission(): assert "users" not in MODULES[Role.STOCK]
def test_admin_has_all_modules(): assert "*" in MODULES[Role.ADMIN]


def test_stock_movement_user_reference_can_be_cleared_on_user_deletion():
    assert StockMovement.__table__.c.user_id.nullable
