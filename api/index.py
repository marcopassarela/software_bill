"""Vercel entry point; routes the Vercel /api prefix to the FastAPI app."""
from backend.app.main import app as logistics_app

async def app(scope, receive, send):
    if scope["type"] in {"http", "websocket"} and scope.get("path", "").startswith("/api"):
        scope = dict(scope)
        scope["path"] = scope["path"][4:] or "/"
        if scope.get("raw_path"):
            scope["raw_path"] = scope["raw_path"][4:] or b"/"
    await logistics_app(scope, receive, send)
