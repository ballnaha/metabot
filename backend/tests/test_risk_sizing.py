"""Risk / lot-sizing tests.

Complements test_execution.py (which covers the min-lot exposure guard, the
notional-to-equity cap, spread/drift rejection and confirm tagging). Here we
pin down the core sizing maths that turns a recommendation into a lot:

* risk_pct sizing from the stop-loss distance (the common path),
* the max_lot clamp,
* the missing-stop-loss fallback,
* equal_slots stake division,
* the low-level normalize_lot rounding the rest of the app relies on.
"""
import unittest
from unittest.mock import patch

from app import mt5_client
from app.models import Action, IndicatorSnapshot, Recommendation
from app.trader import TradeManager, risk_limits_for_symbol


def _rec(symbol="BTCUSD", price=100.0, action=Action.BUY, stop_loss=98.0):
    return Recommendation(
        symbol=symbol,
        timeframe="M15",
        price=price,
        action=action,
        confidence=0.9,
        stop_loss=stop_loss,
        take_profit=None,
        indicators=IndicatorSnapshot(
            symbol=symbol, timeframe="M15", price=price, strategy_name="t"
        ),
    )


# A liquid symbol with simple 1.0 contract size and 0.01 tick maths.
SYMBOL_INFO = {
    "digits": 2,
    "volume_min": 0.01,
    "volume_max": 100.0,
    "volume_step": 0.01,
    "trade_contract_size": 1.0,
    "trade_tick_size": 0.01,
    "trade_tick_value": 0.01,
    "point": 0.01,
}


def _normalize(_symbol, lot):
    """Mirror the real normalize_lot: clamp to [min, max], round to 0.01 step."""
    lot = max(0.01, min(lot, 100.0))
    return round(round(lot / 0.01) * 0.01, 2)


class RiskPctSizingTests(unittest.TestCase):
    """risk_lot in risk_pct mode sizes the lot so hitting SL costs ~risk_amount."""

    def setUp(self):
        self.manager = TradeManager()

    @patch("app.trader.settings")
    @patch("app.trader.mt5_client.account_info", return_value={"equity": 10_000})
    @patch("app.trader.mt5_client.symbol_info", return_value=SYMBOL_INFO)
    def test_sizes_lot_from_sl_distance(self, _info, _acct, settings_mock):
        settings_mock.position_sizing_mode = "risk_pct"
        settings_mock.risk_per_trade = 0.01      # risk $100 of $10k
        settings_mock.max_lot = 100.0
        settings_mock.min_lot_stake_multiple = 0.0
        settings_mock.max_notional_to_equity = 0.0

        # SL distance = |100 - 98| = 2.0; loss/lot = (2.0/0.01)*0.01 = 2.0.
        # lot = risk 100 / 2.0 = 50.0.
        with patch("app.trader.mt5_client.normalize_lot", side_effect=_normalize):
            lot = self.manager.risk_lot("BTCUSD", _rec(stop_loss=98.0))

        self.assertEqual(lot, 50.0)

    @patch("app.trader.settings")
    @patch("app.trader.mt5_client.account_info", return_value={"equity": 10_000})
    @patch("app.trader.mt5_client.symbol_info", return_value=SYMBOL_INFO)
    def test_clamps_to_max_lot(self, _info, _acct, settings_mock):
        settings_mock.position_sizing_mode = "risk_pct"
        settings_mock.risk_per_trade = 0.01
        settings_mock.max_lot = 5.0              # cap below the 50.0 risk lot
        settings_mock.min_lot_stake_multiple = 0.0
        settings_mock.max_notional_to_equity = 0.0

        with patch("app.trader.mt5_client.normalize_lot", side_effect=_normalize):
            lot = self.manager.risk_lot("BTCUSD", _rec(stop_loss=98.0))

        self.assertEqual(lot, 5.0)

    @patch("app.trader.settings")
    @patch("app.trader.mt5_client.account_info", return_value={"equity": 10_000})
    @patch("app.trader.mt5_client.symbol_info", return_value=SYMBOL_INFO)
    def test_falls_back_to_min_lot_without_stop_loss(self, _info, _acct, settings_mock):
        settings_mock.position_sizing_mode = "risk_pct"
        settings_mock.risk_per_trade = 0.01
        settings_mock.max_lot = 100.0
        settings_mock.min_lot_stake_multiple = 0.0
        settings_mock.max_notional_to_equity = 0.0

        rec = _rec(stop_loss=98.0)
        rec.stop_loss = None  # strategy supplied no stop

        with patch("app.trader.mt5_client.normalize_lot", side_effect=_normalize):
            lot = self.manager.risk_lot("BTCUSD", rec)

        self.assertEqual(lot, 0.01)  # volume_min

    @patch("app.trader.settings")
    @patch("app.trader.mt5_client.account_info", return_value={"equity": 10_000})
    @patch("app.trader.mt5_client.symbol_info", return_value=SYMBOL_INFO)
    def test_falls_back_to_min_lot_on_zero_sl_distance(self, _info, _acct, settings_mock):
        settings_mock.position_sizing_mode = "risk_pct"
        settings_mock.risk_per_trade = 0.01
        settings_mock.max_lot = 100.0
        settings_mock.min_lot_stake_multiple = 0.0
        settings_mock.max_notional_to_equity = 0.0

        # SL equal to entry → zero distance → cannot size by risk.
        with patch("app.trader.mt5_client.normalize_lot", side_effect=_normalize):
            lot = self.manager.risk_lot("BTCUSD", _rec(price=100.0, stop_loss=100.0))

        self.assertEqual(lot, 0.01)


class GroupRiskSettingsTests(unittest.TestCase):
    def setUp(self):
        self.manager = TradeManager()

    @patch("app.trader.settings")
    def test_forex_uses_its_own_risk_and_max_lot(self, settings_mock):
        settings_mock.forex_risk_per_trade = 0.0075
        settings_mock.forex_max_lot = 0.25

        risk, max_lot = risk_limits_for_symbol("USDJPYm")

        self.assertEqual(risk, 0.0075)
        self.assertEqual(max_lot, 0.25)

    def test_tick_value_converts_usdjpy_notional_to_account_currency(self):
        # At USDJPY 150, a 0.001 tick worth ~$0.6667 per lot implies roughly
        # $100,000 notional per standard lot, not JPY 15,000,000.
        info = {
            "trade_tick_size": 0.001,
            "trade_tick_value": 0.6666666667,
            "trade_contract_size": 100_000,
        }

        notional = TradeManager._notional_per_lot(info, 150.0)

        self.assertAlmostEqual(notional, 100_000.0, places=2)

    @patch("app.trader.mt5_client.account_info", side_effect=RuntimeError("no terminal"))
    def test_returns_safe_min_when_account_unavailable(self, _acct):
        # If MT5 can't be reached, sizing must not blow up — fall back to 0.01.
        lot = self.manager.risk_lot("BTCUSD", _rec())
        self.assertEqual(lot, 0.01)


class EqualSlotsSizingTests(unittest.TestCase):
    """equal_slots divides equity (or a fixed stake) across the slot count."""

    def setUp(self):
        self.manager = TradeManager()

    @patch("app.trader.max_slots_for_symbol", return_value=5)
    @patch("app.trader.settings")
    @patch("app.trader.mt5_client.account_info", return_value={"equity": 10_000})
    @patch("app.trader.mt5_client.symbol_info", return_value=SYMBOL_INFO)
    def test_uses_fixed_stake_amount(self, _info, _acct, settings_mock, _slots):
        settings_mock.position_sizing_mode = "equal_slots"
        settings_mock.stake_amount = 500.0       # explicit stake
        settings_mock.max_lot = 100.0
        settings_mock.min_lot_stake_multiple = 0.0
        settings_mock.max_notional_to_equity = 0.0

        # lot = stake 500 / (price 100 * contract 1) = 5.0.
        with patch("app.trader.mt5_client.normalize_lot", side_effect=_normalize):
            lot = self.manager.risk_lot("BTCUSD", _rec(price=100.0))

        self.assertEqual(lot, 5.0)

    @patch("app.trader.max_slots_for_symbol", return_value=4)
    @patch("app.trader.settings")
    @patch("app.trader.mt5_client.account_info", return_value={"equity": 10_000})
    @patch("app.trader.mt5_client.symbol_info", return_value=SYMBOL_INFO)
    def test_divides_equity_across_slots_when_no_stake(
        self, _info, _acct, settings_mock, _slots
    ):
        settings_mock.position_sizing_mode = "equal_slots"
        settings_mock.stake_amount = 0.0         # derive from equity / slots
        settings_mock.max_lot = 100.0
        settings_mock.min_lot_stake_multiple = 0.0
        settings_mock.max_notional_to_equity = 0.0

        # stake = 10_000 / 4 slots = 2_500; lot = 2_500 / 100 = 25.0.
        with patch("app.trader.mt5_client.normalize_lot", side_effect=_normalize):
            lot = self.manager.risk_lot("BTCUSD", _rec(price=100.0))

        self.assertEqual(lot, 25.0)


class NormalizeLotTests(unittest.TestCase):
    """The low-level rounding every sizing path funnels through."""

    @patch("app.mt5_client.symbol_info", return_value=SYMBOL_INFO)
    def test_rounds_down_to_step(self, _info):
        # 0.1234 → nearest 0.01 step = 0.12.
        self.assertEqual(mt5_client.normalize_lot("BTCUSD", 0.1234), 0.12)

    @patch("app.mt5_client.symbol_info", return_value=SYMBOL_INFO)
    def test_clamps_below_min_up_to_min(self, _info):
        self.assertEqual(mt5_client.normalize_lot("BTCUSD", 0.0), 0.01)

    @patch("app.mt5_client.symbol_info", return_value=SYMBOL_INFO)
    def test_clamps_above_max_down_to_max(self, _info):
        self.assertEqual(mt5_client.normalize_lot("BTCUSD", 999.0), 100.0)


if __name__ == "__main__":
    unittest.main()
