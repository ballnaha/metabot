"""Central configuration loaded from environment / .env file."""
from __future__ import annotations

import os
from functools import lru_cache
from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict

env_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".env"))


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=env_path, env_file_encoding="utf-8", extra="ignore"
    )

    # MT5
    mt5_login: int | None = None
    mt5_password: str | None = None
    mt5_server: str | None = None
    mt5_path: str | None = None
    mt5_server_utc_offset: int = 3

    # AI providers
    deepseek_api_key: str | None = None
    deepseek_model: str = "deepseek-chat"
    gemini_api_key: str | None = None
    gemini_model: str = "gemini-1.5-flash"
    ai_providers: str = "deepseek,gemini"
    # When True, AI opinions act as an extra confirmation filter on top of the
    # strategy signal. When False, the strategy decides on its own.
    use_ai: bool = False

    # Telegram
    telegram_bot_token: str | None = None
    telegram_chat_id: str | None = None
    telegram_enabled: bool = True

    # Trading
    symbols: str = "EURUSD,GOLD,BTCUSD"
    default_timeframe: str = "M15"
    crypto_timeframe: str = "H4"
    gold_timeframe: str = "H4"
    gold_strategy: str = "ema_macd_rsi"
    strategy: str = "ema_macd_rsi"
    risk_per_trade: float = 0.01
    max_lot: float = 1.0
    magic: int = 556677
    gold_magic: int = 556688
    atr_sl_mult: float = 1.5
    default_rr: float = 2.0
    bot_enabled: bool = True
    gold_bot_enabled: bool = True
    auto_trade_interval: int = 60
    max_spread_points: int = 0           # 0 = disabled; e.g. 30 = skip if spread > 30 pts
    max_daily_loss_pct: float = 0.0      # 0 = disabled; 0.05 = pause when daily loss ≥ 5%
    max_consecutive_losses: int = 0      # 0 = disabled; e.g. 3 = pause after 3 losses in a row
    breakeven_r: float = 1.0             # move SL to entry after 1×SL-dist profit; 0 = off
    trailing_stop_r: float = 0.0         # start trailing after N×SL-dist profit; 0 = off (e.g. 1.5)
    position_sizing_mode: str = "risk_pct"
    max_open_trades: int = 5
    max_crypto_open_trades: int = 5
    max_gold_open_trades: int = 3
    stake_amount: float = 0.0

    # Stocks (US equities) — independent settings
    stock_bot_enabled: bool = False        # ปิดไว้ก่อนจนกว่าจะตั้งค่าครบ
    stock_magic: int = 0                   # auto-generated
    max_stock_open_trades: int = 4         # กระจายไม่เกิน 4 ตัว
    stock_timeframe: str = "H4"           # H4 เหมาะกับหุ้น — ตัด noise ได้ดี
    stock_strategy: str = "trend"          # trend follow เหมาะกับหุ้น US
    stock_risk_per_trade: float = 0.005    # 0.5% conservative สำหรับ CFD
    stock_max_lot: float = 5.0             # หุ้น CFD lot ใหญ่กว่า crypto
    stock_atr_sl_mult: float = 2.0         # wide stop — หุ้นมี overnight gap
    stock_rr: float = 3.0                  # หุ้น trend ได้ไกล R:R ควรสูง
    stock_use_ai: bool = False
    stock_auto_trade_interval: int = 900   # 15 นาที — หุ้นไม่ต้องสแกนบ่อย

    # Forex (currency pairs) — independent settings
    forex_bot_enabled: bool = False        # ปิดไว้ก่อนจนกว่าจะตั้งค่าครบ
    forex_magic: int = 0                   # auto-generated
    max_forex_open_trades: int = 5         # คู่เงิน major เปิดได้หลายคู่
    forex_timeframe: str = "H1"           # H1 เหมาะกับ Forex — ไม่เร็วเกินไป
    forex_strategy: str = "ema_macd_rsi"  # EMA+MACD+RSI เหมาะกับ Forex มาก
    forex_risk_per_trade: float = 0.01    # 1% standard สำหรับ Forex
    forex_max_lot: float = 2.0             # Forex lot ปกติ
    forex_atr_sl_mult: float = 1.5        # ATR × 1.5 เหมาะกับ Forex
    forex_rr: float = 2.0                  # R:R 1:2 มาตรฐาน
    forex_use_ai: bool = False
    forex_auto_trade_interval: int = 300   # 5 นาที — Forex สแกนบ่อยกว่าหุ้น

    # API
    api_host: str = "127.0.0.1"
    api_port: int = 8383
    api_key: str = "change-me-please"

    @property
    def provider_list(self) -> List[str]:
        return [p.strip().lower() for p in self.ai_providers.split(",") if p.strip()]

    @property
    def symbol_list(self) -> List[str]:
        return [s.strip().upper() for s in self.symbols.split(",") if s.strip()]

    def update_settings(self, updates: dict) -> None:
        import os
        # 1. Update in-memory settings
        for key, val in updates.items():
            if hasattr(self, key):
                # Handle correct type conversions
                old_val = getattr(self, key)
                if old_val is not None:
                    try:
                        if isinstance(old_val, bool):
                            if isinstance(val, str):
                                val = val.lower() in ("true", "1", "yes")
                            else:
                                val = bool(val)
                        elif isinstance(old_val, int):
                            val = int(val)
                        elif isinstance(old_val, float):
                            val = float(val)
                    except (ValueError, TypeError):
                        pass
                setattr(self, key, val)

        # 2. Update .env file
        env_file = ".env"
        possible_paths = [
            env_file,
            os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"),
            os.path.join(os.getcwd(), ".env"),
            os.path.join(os.getcwd(), "backend", ".env")
        ]
        
        target_path = None
        for p in possible_paths:
            if os.path.exists(p):
                target_path = p
                break
        
        if not target_path:
            target_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env")

        if os.path.exists(target_path):
            with open(target_path, "r", encoding="utf-8") as f:
                lines = f.readlines()
        else:
            lines = []

        for key, val in updates.items():
            env_key = key.upper()
            found = False
            for i, line in enumerate(lines):
                stripped = line.strip()
                if stripped.startswith(env_key + "=") or stripped.startswith(env_key + " ="):
                    if isinstance(val, bool):
                        val_str = "true" if val else "false"
                    elif val is None:
                        val_str = ""
                    else:
                        val_str = str(val)
                    lines[i] = f"{env_key}={val_str}\n"
                    found = True
                    break
            if not found:
                if isinstance(val, bool):
                    val_str = "true" if val else "false"
                elif val is None:
                    val_str = ""
                else:
                    val_str = str(val)
                lines.append(f"{env_key}={val_str}\n")

        with open(target_path, "w", encoding="utf-8") as f:
            f.writelines(lines)



@lru_cache
def get_settings() -> Settings:
    import random
    s = Settings()
    if s.magic == 0:
        s.magic = random.randint(100000, 999999)
        s.update_settings({"magic": s.magic})
    if s.gold_magic == 0:
        s.gold_magic = random.randint(100000, 999999)
        s.update_settings({"gold_magic": s.gold_magic})
    if s.stock_magic == 0:
        s.stock_magic = random.randint(100000, 999999)
        s.update_settings({"stock_magic": s.stock_magic})
    if s.forex_magic == 0:
        s.forex_magic = random.randint(100000, 999999)
        s.update_settings({"forex_magic": s.forex_magic})
    return s


settings = get_settings()
