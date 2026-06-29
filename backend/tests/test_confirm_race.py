"""Concurrency test for TradeManager.confirm().

Once the API is served on a threadpool, two callers (e.g. the dashboard and
the Telegram bot, or a double-click) can land in confirm() for the same
pending id at the same time. Only one may actually send an order; the other
must lose the check-and-claim race and raise.
"""
import threading
import time
import unittest
from unittest.mock import patch

from app.models import Action, IndicatorSnapshot, Recommendation
from app.trader import TradeManager


def _rec():
    return Recommendation(
        symbol="BTCUSD",
        timeframe="M15",
        price=100.0,
        action=Action.BUY,
        confidence=0.9,
        stop_loss=98.0,
        take_profit=104.0,
        indicators=IndicatorSnapshot(
            symbol="BTCUSD", timeframe="M15", price=100.0, strategy_name="t"
        ),
    )


class ConfirmRaceTests(unittest.TestCase):
    def setUp(self):
        self.manager = TradeManager()

    @patch("app.trader.release_trade_slot")
    @patch("app.trader.mt5_client.order_send")
    @patch("app.trader.mt5_client.symbol_info", return_value={"digits": 2})
    @patch("app.trader.mt5_client.get_tick", return_value={"bid": 100.0, "ask": 100.2})
    def test_concurrent_confirm_sends_one_order(
        self, _tick, _info, order_send, _release
    ):
        # Make the order_send slow so both threads are inside confirm() at once,
        # maximising the window the lock has to protect.
        def slow_send(*_a, **_k):
            time.sleep(0.05)
            return {"ok": True}

        order_send.side_effect = slow_send

        pending = self.manager.stage(_rec(), lot=0.1)
        results = {}
        errors = []

        def worker(name):
            try:
                results[name] = self.manager.confirm(pending.id, slot_reserved=True)
            except Exception as e:  # noqa: BLE001
                errors.append(e)

        t1 = threading.Thread(target=worker, args=("a",))
        t2 = threading.Thread(target=worker, args=("b",))
        t1.start(); t2.start()
        t1.join(); t2.join()

        # Exactly one order sent, one caller succeeded, one was rejected.
        self.assertEqual(order_send.call_count, 1)
        self.assertEqual(len(results), 1)
        self.assertEqual(len(errors), 1)
        self.assertEqual(next(iter(results.values())).status, "executed")

    @patch("app.trader.release_trade_slot")
    @patch("app.trader.mt5_client.order_send", return_value={"ok": True})
    @patch("app.trader.mt5_client.symbol_info", return_value={"digits": 2})
    @patch("app.trader.mt5_client.get_tick", return_value={"bid": 100.0, "ask": 100.2})
    def test_second_confirm_after_first_is_rejected(
        self, _tick, _info, _send, _release
    ):
        pending = self.manager.stage(_rec(), lot=0.1)
        self.manager.confirm(pending.id, slot_reserved=True)

        # Re-confirming an executed trade must not fire a second order.
        with self.assertRaisesRegex(ValueError, "already"):
            self.manager.confirm(pending.id, slot_reserved=True)

    def test_cancel_after_confirm_is_rejected(self):
        with patch("app.trader.release_trade_slot"), \
             patch("app.trader.mt5_client.order_send", return_value={"ok": True}), \
             patch("app.trader.mt5_client.symbol_info", return_value={"digits": 2}), \
             patch("app.trader.mt5_client.get_tick", return_value={"bid": 100.0, "ask": 100.2}):
            pending = self.manager.stage(_rec(), lot=0.1)
            self.manager.confirm(pending.id, slot_reserved=True)

        # cancel() only flips status for trades still "pending"; an executed
        # one is left untouched.
        result = self.manager.cancel(pending.id)
        self.assertEqual(result.status, "executed")


if __name__ == "__main__":
    unittest.main()
