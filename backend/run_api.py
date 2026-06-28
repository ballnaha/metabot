"""Entry point: start the FastAPI server.

    python run_api.py
"""
import socket
import sys

# Force UTF-8 on the console before anything logs. MetaTrader5 returns
# Thai-localized error strings; the default Windows locale codec (cp874)
# can't encode them, which crashes the log handler and masks real errors.
for _stream in (sys.stdout, sys.stderr):
    _reconfigure = getattr(_stream, "reconfigure", None)
    if _reconfigure is not None:
        try:
            _reconfigure(encoding="utf-8", errors="backslashreplace")
        except Exception:
            pass

import uvicorn

from app.config import settings


def _port_is_available(host: str, port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            sock.bind((host, port))
        except OSError:
            return False
    return True


if __name__ == "__main__":
    if not _port_is_available(settings.api_host, settings.api_port):
        print(
            f"ERROR: {settings.api_host}:{settings.api_port} is already in use. "
            "Close the existing MetaBot window, run stop.bat, or change API_PORT in backend\\.env."
        )
        sys.exit(1)

    uvicorn.run(
        "app.api:app",
        host=settings.api_host,
        port=settings.api_port,
        reload=False,
    )
