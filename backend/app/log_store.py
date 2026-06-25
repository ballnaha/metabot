"""In-memory circular log buffer shared across the app.

Call  push(level, event, message, detail)  from anywhere.
The API exposes the buffer via GET /api/logs.
"""
from __future__ import annotations

import threading
from collections import deque
from datetime import datetime, timezone, timedelta
from typing import Any, Deque, Dict, List, Optional

TZ_TH = timezone(timedelta(hours=7))

_CAPACITY = 200
_buf: Deque[Dict[str, Any]] = deque(maxlen=_CAPACITY)
_lock = threading.Lock()
_seq = 0


def push(
    level: str,           # info | success | warning | error
    event: str,           # trade_executed | skipped | signal | closed | equity_alert | system
    message: str,
    detail: Optional[Dict[str, Any]] = None,
) -> None:
    global _seq
    with _lock:
        _seq += 1
        _buf.append({
            "id": _seq,
            "time": datetime.now(TZ_TH).strftime("%Y-%m-%dT%H:%M:%S"),
            "level": level,
            "event": event,
            "message": message,
            "detail": detail or {},
        })


def get(limit: int = 100, level: Optional[str] = None) -> List[Dict[str, Any]]:
    with _lock:
        entries = list(_buf)
    if level:
        entries = [e for e in entries if e["level"] == level]
    return list(reversed(entries))[:limit]
