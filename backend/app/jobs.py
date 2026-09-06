from datetime import datetime, timedelta, timezone
from sqlalchemy import delete

AUDIT_RETENTION_DAYS = 90   # ajuste conforme necessidade (30, 60, 90...)

def purge_old_audit_logs(db: Session, days: int = AUDIT_RETENTION_DAYS) -> int:
    """Remove logs mais antigos que X dias. Retorna quantos registros foram apagados."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    result = db.execute(
        delete(AuditLog).where(AuditLog.created_at < cutoff)
    )
    db.commit()
    return result.rowcount