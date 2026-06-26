"""AI advisory layer.

Builds a structured prompt from the indicator snapshot and asks each configured
LLM provider (Deepseek / Gemini) for a trading opinion. Providers return strict JSON
which we parse into an AIOpinion. The engine then merges the rule-based bias and
the AI opinions into one final Recommendation.
"""
from __future__ import annotations

import json
import re
from typing import List, Optional

import httpx

from .config import settings
from .market_groups import market_group
from .models import Action, AIOpinion, IndicatorSnapshot, Recommendation

SYSTEM_PROMPT = (
    "You are a disciplined trading analyst for the MetaTrader 5 platform. "
    "You are given the latest technical indicator values for one symbol. "
    "Decide whether to BUY, SELL or HOLD for a short-term swing trade. "
    "Be conservative: prefer HOLD when signals conflict. "
    "Respond with ONLY a compact JSON object, no markdown, with keys: "
    "action (BUY|SELL|HOLD), confidence (0..1), stop_loss (number or null), "
    "take_profit (number or null), reasoning (one short sentence). "
    "stop_loss/take_profit must be absolute price levels consistent with the "
    "action and current price."
)


def _build_user_prompt(snap: IndicatorSnapshot) -> str:
    return (
        f"Symbol: {snap.symbol}\n"
        f"Timeframe: {snap.timeframe}\n"
        f"Current price: {snap.price}\n"
        f"RSI(14): {snap.rsi}\n"
        f"MACD: {snap.macd} | signal: {snap.macd_signal} | hist: {snap.macd_hist}\n"
        f"EMA12: {snap.ema_fast} | EMA26: {snap.ema_slow}\n"
        f"ATR(14): {snap.atr}\n"
        f"Bollinger upper/lower: {snap.bb_upper} / {snap.bb_lower}\n"
        f"Strategy '{snap.strategy_name}' signal: {snap.rule_bias} "
        f"(confidence {snap.strategy_confidence:.0%}; "
        f"{'; '.join(snap.rule_reasons)})\n"
    )


def _parse_opinion(provider: str, text: str) -> AIOpinion:
    """Extract the JSON object from a model response and validate it."""
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if not match:
        return AIOpinion(provider=provider, error=f"No JSON in response: {text[:200]}")
    try:
        data = json.loads(match.group(0))
    except json.JSONDecodeError as e:
        return AIOpinion(provider=provider, error=f"Bad JSON: {e}")

    action_raw = str(data.get("action", "HOLD")).upper()
    action = Action(action_raw) if action_raw in Action.__members__ else Action.HOLD
    try:
        confidence = float(data.get("confidence", 0.0))
    except (TypeError, ValueError):
        confidence = 0.0
    return AIOpinion(
        provider=provider,
        action=action,
        confidence=max(0.0, min(1.0, confidence)),
        stop_loss=_to_float(data.get("stop_loss")),
        take_profit=_to_float(data.get("take_profit")),
        reasoning=str(data.get("reasoning", ""))[:400],
    )


def _to_float(v) -> Optional[float]:
    try:
        if v is None:
            return None
        return float(v)
    except (TypeError, ValueError):
        return None


async def ask_deepseek(snap: IndicatorSnapshot) -> AIOpinion:
    if not settings.deepseek_api_key:
        return AIOpinion(provider="deepseek", error="DEEPSEEK_API_KEY not set")
    url = "https://api.deepseek.com/chat/completions"
    payload = {
        "model": settings.deepseek_model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": _build_user_prompt(snap)},
        ],
        "temperature": 0.2,
        "stream": False,
        "response_format": {"type": "json_object"},
    }
    headers = {"Authorization": f"Bearer {settings.deepseek_api_key}"}
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.post(url, json=payload, headers=headers)
            r.raise_for_status()
            text = r.json()["choices"][0]["message"]["content"]
        return _parse_opinion("deepseek", text)
    except Exception as e:  # noqa: BLE001 - surface any provider failure
        return AIOpinion(provider="deepseek", error=str(e))


async def ask_gemini(snap: IndicatorSnapshot) -> AIOpinion:
    if not settings.gemini_api_key:
        return AIOpinion(provider="gemini", error="GEMINI_API_KEY not set")
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{settings.gemini_model}:generateContent?key={settings.gemini_api_key}"
    )
    payload = {
        "system_instruction": {"parts": [{"text": SYSTEM_PROMPT}]},
        "contents": [{"parts": [{"text": _build_user_prompt(snap)}]}],
        "generationConfig": {"temperature": 0.2, "responseMimeType": "application/json"},
    }
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.post(url, json=payload)
            r.raise_for_status()
            data = r.json()
            text = data["candidates"][0]["content"]["parts"][0]["text"]
        return _parse_opinion("gemini", text)
    except Exception as e:  # noqa: BLE001
        return AIOpinion(provider="gemini", error=str(e))


_PROVIDERS = {"deepseek": ask_deepseek, "gemini": ask_gemini}


async def gather_opinions(snap: IndicatorSnapshot) -> List[AIOpinion]:
    import asyncio

    tasks = [
        _PROVIDERS[p](snap) for p in settings.provider_list if p in _PROVIDERS
    ]
    if not tasks:
        return []
    return list(await asyncio.gather(*tasks))


def decide(
    snap: IndicatorSnapshot, opinions: List[AIOpinion], use_ai: bool
) -> Recommendation:
    """The strategy decides; the AI (when enabled) is a confirmation filter.

    - AI off  -> follow the strategy signal as-is.
    - AI on   -> keep the strategy's BUY/SELL only if the AI agrees; otherwise
                 downgrade to HOLD (filtered). If every AI errored, fall back to
                 the strategy alone and flag it as unavailable.
    """
    s_action = snap.rule_bias
    s_conf = max(snap.strategy_confidence, 0.0)
    valid = [o for o in opinions if o.error is None]

    action = s_action
    confidence = s_conf
    ai_verdict = ""

    if use_ai and s_action != Action.HOLD:
        if not valid:
            ai_verdict = "unavailable"  # all providers errored -> trust strategy
        else:
            agree = [o for o in valid if o.action == s_action]
            agree_ratio = len(agree) / len(valid)
            if agree_ratio > 0.5:
                ai_conf = sum(o.confidence for o in agree) / len(agree)
                action = s_action
                confidence = round((s_conf + ai_conf) / 2, 2)
                ai_verdict = "confirmed"
            else:
                action = Action.HOLD  # AI vetoes the strategy signal
                confidence = round(s_conf * (1 - agree_ratio), 2)
                ai_verdict = "filtered"

    # SL/TP: prefer agreeing AI levels, then the strategy's own, then ATR.
    stop_loss = take_profit = None
    if action in (Action.BUY, Action.SELL):
        agree = [o for o in valid if o.action == action]
        stop_loss = next((o.stop_loss for o in agree if o.stop_loss), None)
        take_profit = next((o.take_profit for o in agree if o.take_profit), None)
        if action == snap.rule_bias:
            stop_loss = stop_loss or snap.strategy_sl
            take_profit = take_profit or snap.strategy_tp
        if not stop_loss or not take_profit:
            stop_loss, take_profit = _atr_levels(snap, action, stop_loss, take_profit)

    parts = [f"{o.provider}:{o.action.value}({o.confidence:.0%})" for o in valid]
    errors = [f"{o.provider} err" for o in opinions if o.error]
    ai_part = (
        "off"
        if not use_ai
        else (", ".join(parts + errors) + f" -> {ai_verdict}" if opinions else ai_verdict)
    )
    summary = (
        f"{action.value} @ {snap.price} | conf {confidence:.0%} | "
        f"strategy[{snap.strategy_name}]:{s_action.value}({s_conf:.0%}) | "
        f"AI: {ai_part}"
    )

    return Recommendation(
        symbol=snap.symbol,
        timeframe=snap.timeframe,
        price=snap.price,
        action=action,
        confidence=confidence,
        stop_loss=stop_loss,
        take_profit=take_profit,
        summary=summary,
        indicators=snap,
        opinions=opinions,
        ai_used=use_ai,
        ai_verdict=ai_verdict,
    )


def _atr_levels(snap, action, sl, tp):
    is_stock = market_group(snap.symbol) == "stock"
    sl_mult  = settings.stock_atr_sl_mult if is_stock else settings.atr_sl_mult
    rr       = settings.stock_rr          if is_stock else settings.default_rr
    atr      = snap.atr or (snap.price * 0.005)
    sl_dist  = sl_mult * atr
    if action == Action.BUY:
        sl = sl or snap.price - sl_dist
        tp = tp or snap.price + sl_dist * rr
    else:
        sl = sl or snap.price + sl_dist
        tp = tp or snap.price - sl_dist * rr
    return round(sl, 6), round(tp, 6)
