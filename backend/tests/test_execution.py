import unittest
from unittest.mock import patch

from app.models import Action, IndicatorSnapshot, Recommendation
from app.trader import TradeManager


def recommendation(action=Action.BUY):
    return Recommendation(
        symbol="BTCUSD",
        timeframe="M15",
        price=100.0,
        action=action,
        confidence=0.9,
        stop_loss=98.0 if action == Action.BUY else 102.0,
        take_profit=104.0 if action == Action.BUY else 96.0,
        indicators=IndicatorSnapshot(
            symbol="BTCUSD",
            timeframe="M15",
            price=100.0,
            strategy_name="crypto_early_stage",
        ),
    )


class MarketExecutionTests(unittest.TestCase):
    def setUp(self):
        self.manager = TradeManager()

    @patch("app.trader.mt5_client.symbol_info", return_value={"digits": 2})
    @patch("app.trader.mt5_client.get_tick", return_value={"bid": 100.2, "ask": 100.4})
    def test_buy_levels_are_rebased_around_ask(self, _tick, _info):
        rec = recommendation(Action.BUY)

        execution = self.manager._prepare_market_execution(rec)

        self.assertEqual(rec.price, 100.4)
        self.assertEqual(rec.stop_loss, 98.4)
        self.assertEqual(rec.take_profit, 104.4)
        self.assertAlmostEqual(execution["spread_to_sl"], 0.1)
        self.assertAlmostEqual(execution["drift_to_sl"], 0.1)

    @patch("app.trader.mt5_client.symbol_info", return_value={"digits": 2})
    @patch("app.trader.mt5_client.get_tick", return_value={"bid": 99.9, "ask": 100.1})
    def test_sell_levels_are_rebased_around_bid(self, _tick, _info):
        rec = recommendation(Action.SELL)

        self.manager._prepare_market_execution(rec)

        self.assertEqual(rec.price, 99.9)
        self.assertEqual(rec.stop_loss, 101.9)
        self.assertEqual(rec.take_profit, 95.9)

    @patch("app.trader.mt5_client.symbol_info", return_value={"digits": 2})
    @patch("app.trader.mt5_client.get_tick", return_value={"bid": 100.0, "ask": 100.6})
    def test_rejects_spread_that_consumes_too_much_risk(self, _tick, _info):
        with self.assertRaisesRegex(ValueError, "spread"):
            self.manager._prepare_market_execution(recommendation())

    @patch("app.trader.mt5_client.symbol_info", return_value={"digits": 2})
    @patch("app.trader.mt5_client.get_tick", return_value={"bid": 101.2, "ask": 101.3})
    def test_rejects_stale_signal_after_large_price_move(self, _tick, _info):
        with self.assertRaisesRegex(ValueError, "price moved"):
            self.manager._prepare_market_execution(recommendation())

    @patch("app.trader.release_trade_slot")
    @patch("app.trader.mt5_client.order_send")
    @patch("app.trader.mt5_client.normalize_lot", return_value=0.1)
    @patch("app.trader.mt5_client.account_info", return_value={"equity": 10_000})
    @patch(
        "app.trader.mt5_client.symbol_info",
        return_value={
            "digits": 2,
            "volume_min": 0.01,
            "trade_tick_size": 0.01,
            "trade_tick_value": 0.01,
            "point": 0.01,
        },
    )
    @patch("app.trader.mt5_client.get_tick", return_value={"bid": 100.0, "ask": 100.2})
    def test_confirm_tags_strategy_and_sends_rebased_levels(
        self, _tick, _info, _account, _normalize, order_send, _release
    ):
        order_send.return_value = {"ok": True}
        pending = self.manager.stage(recommendation(), lot=0.1)

        result = self.manager.confirm(pending.id, slot_reserved=True)

        self.assertEqual(result.status, "executed")
        kwargs = order_send.call_args.kwargs
        self.assertEqual(kwargs["comment"], "mb|crypto_early_stage")
        self.assertEqual(kwargs["sl"], 98.2)
        self.assertEqual(kwargs["tp"], 104.2)
        self.assertEqual(result.result["strategy"], "crypto_early_stage")


if __name__ == "__main__":
    unittest.main()
