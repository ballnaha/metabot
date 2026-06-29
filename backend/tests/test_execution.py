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
            strategy_name="squeeze_breakout",
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
    @patch("app.trader.mt5_client.get_tick", return_value={"bid": 100.0, "ask": 101.2})
    def test_rejects_spread_that_consumes_too_much_risk(self, _tick, _info):
        with self.assertRaisesRegex(ValueError, "spread"):
            self.manager._prepare_market_execution(recommendation())

    @patch("app.trader.mt5_client.symbol_info", return_value={"digits": 2})
    @patch("app.trader.mt5_client.get_tick", return_value={"bid": 100.0, "ask": 100.6})
    def test_crypto_allows_spread_up_to_its_separate_limit(self, _tick, _info):
        execution = self.manager._prepare_market_execution(recommendation())

        self.assertAlmostEqual(execution["spread_to_sl"], 0.3)

    @patch("app.trader.mt5_client.symbol_info", return_value={"digits": 2})
    @patch("app.trader.mt5_client.get_tick", return_value={"bid": 101.7, "ask": 101.8})
    def test_rejects_stale_signal_after_large_price_move(self, _tick, _info):
        # bid 101.7 vs signal 100.0 over a 2.0 SL distance = 85% drift > 75% limit.
        with self.assertRaisesRegex(ValueError, "price moved"):
            self.manager._prepare_market_execution(recommendation())

    @patch("app.trader.mt5_client.symbol_info", return_value={"digits": 2})
    @patch("app.trader.mt5_client.get_tick", return_value={"bid": 101.7, "ask": 101.8})
    def test_drift_measured_from_signal_ref_price_when_present(self, _tick, _info):
        # The closed-candle price (100.0) is stale, but the live decision-time
        # mid (101.6) is close to the fill, so this is NOT real slippage.
        rec = recommendation()
        rec.signal_ref_price = 101.6
        execution = self.manager._prepare_market_execution(rec)
        # bid 101.7 vs ref 101.6 over 2.0 SL distance = 5% drift, well within limit.
        self.assertAlmostEqual(execution["drift_to_sl"], 0.05)

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
        self.assertEqual(kwargs["comment"], "mb|squeeze_breakout")
        self.assertEqual(kwargs["sl"], 98.2)
        self.assertEqual(kwargs["tp"], 104.2)
        self.assertEqual(result.result["strategy"], "squeeze_breakout")


class MinLotExposureGuardTests(unittest.TestCase):
    """The broker's min lot can force a position far larger than the stake.

    Scenario: stake $100, BTC at $60,000, contract size 1, min lot 0.01.
    Desired lot = 100 / 60000 = 0.0017, but min lot forces 0.01 → notional
    ≈ $600 = 6× the stake.
    """

    BTC_INFO = {
        "digits": 2,
        "volume_min": 0.01,
        "volume_max": 100.0,
        "volume_step": 0.01,
        "trade_contract_size": 1.0,
    }

    def setUp(self):
        self.manager = TradeManager()

    def _rec(self):
        rec = recommendation(Action.BUY)
        rec.symbol = "BTCUSD"
        rec.price = 60_000.0
        return rec

    @patch("app.trader.settings")
    @patch("app.trader.mt5_client.normalize_lot", return_value=0.01)
    @patch("app.trader.mt5_client.account_info", return_value={"equity": 10_000})
    @patch("app.trader.mt5_client.symbol_info")
    def test_skips_when_min_lot_exceeds_multiple(self, info, _acct, _norm, settings_mock):
        info.return_value = self.BTC_INFO
        settings_mock.position_sizing_mode = "equal_slots"
        settings_mock.stake_amount = 100.0
        settings_mock.max_lot = 1.0
        settings_mock.max_crypto_open_trades = 5
        settings_mock.max_open_trades = 5
        settings_mock.max_notional_to_equity = 0.0
        settings_mock.min_lot_stake_multiple = 3.0  # 6× > 3× → veto

        lot = self.manager.risk_lot("BTCUSD", self._rec())
        self.assertEqual(lot, 0.0)

    @patch("app.trader.settings")
    @patch("app.trader.mt5_client.normalize_lot", return_value=0.01)
    @patch("app.trader.mt5_client.account_info", return_value={"equity": 10_000})
    @patch("app.trader.mt5_client.symbol_info")
    def test_trades_min_lot_when_guard_disabled(self, info, _acct, _norm, settings_mock):
        info.return_value = self.BTC_INFO
        settings_mock.position_sizing_mode = "equal_slots"
        settings_mock.stake_amount = 100.0
        settings_mock.max_lot = 1.0
        settings_mock.max_crypto_open_trades = 5
        settings_mock.max_open_trades = 5
        settings_mock.max_notional_to_equity = 0.0
        settings_mock.min_lot_stake_multiple = 0.0  # disabled → still trades

        lot = self.manager.risk_lot("BTCUSD", self._rec())
        self.assertEqual(lot, 0.01)


class NotionalCapTests(unittest.TestCase):
    """A tight SL makes risk_pct size a big lot; the equity cap bounds it."""

    BTC_INFO = {
        "digits": 2,
        "volume_min": 0.01,
        "volume_max": 100.0,
        "volume_step": 0.01,
        "trade_contract_size": 1.0,
        "trade_tick_size": 0.01,
        "trade_tick_value": 0.01,
        "point": 0.01,
    }

    def setUp(self):
        self.manager = TradeManager()

    def _rec(self):
        rec = recommendation(Action.SELL)
        rec.symbol = "BTCUSD"
        rec.price = 60_000.0
        rec.stop_loss = 60_050.0  # tight 50-point SL
        return rec

    def _normalize(self, _symbol, lot):
        # Mirror the real normalize_lot: clamp to [min, max], round to 0.01 step.
        lot = max(0.01, min(lot, 100.0))
        return round(round(lot / 0.01) * 0.01, 2)

    @patch("app.trader.settings")
    @patch("app.trader.mt5_client.account_info", return_value={"equity": 7_000})
    @patch("app.trader.mt5_client.symbol_info")
    def test_caps_oversized_lot_to_equity(self, info, _acct, settings_mock):
        info.return_value = self.BTC_INFO
        settings_mock.position_sizing_mode = "risk_pct"
        settings_mock.risk_per_trade = 0.01     # risk $70
        settings_mock.max_lot = 100.0
        settings_mock.min_lot_stake_multiple = 0.0
        settings_mock.max_notional_to_equity = 2.0  # cap = 2 × 7000 = $14,000

        with patch("app.trader.mt5_client.normalize_lot", side_effect=self._normalize):
            lot = self.manager.risk_lot("BTCUSD", self._rec())

        # Uncapped: risk 70 / (50/0.01 * 0.01) = 70/50 = 1.40 lot → notional 84k.
        # Cap: 14,000 / 60,000 = 0.2333 → normalized 0.23.
        self.assertEqual(lot, 0.23)

    @patch("app.trader.settings")
    @patch("app.trader.mt5_client.account_info", return_value={"equity": 7_000})
    @patch("app.trader.mt5_client.symbol_info")
    def test_no_cap_when_disabled(self, info, _acct, settings_mock):
        info.return_value = self.BTC_INFO
        settings_mock.position_sizing_mode = "risk_pct"
        settings_mock.risk_per_trade = 0.01
        settings_mock.max_lot = 100.0
        settings_mock.min_lot_stake_multiple = 0.0
        settings_mock.max_notional_to_equity = 0.0  # disabled

        with patch("app.trader.mt5_client.normalize_lot", side_effect=self._normalize):
            lot = self.manager.risk_lot("BTCUSD", self._rec())

        self.assertEqual(lot, 1.40)  # full risk-based lot, uncapped


if __name__ == "__main__":
    unittest.main()
