"""Entry point: start the FastAPI server.

    python run_api.py
"""
import socket
import sys

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
