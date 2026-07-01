"""Standard Cent account compatibility tests."""
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from app import mt5_client
from app.models import Action, IndicatorSnapshot, Recommendation
from app.trader import TradeManager


class CentAccountMetadataTests(unittest.TestCase):
    def test_usc_account_exposes_major_currency_values(self):
        fake_mt5 = MagicMock()
        fake_mt5.account_info.return_value = SimpleNamespace(
            login=123,
            server="Exness-MT5Real",
            currency="USC",
            balance=10_000.0,
            equity=9_850.0,
            margin=100.0,
            margin_free=9_750.0,
            profit=-150.0,
            leverage=2000,
        )

        with patch.object(mt5_client, "mt5", fake_mt5):
            info = mt5_client.account_info()

        self.assertTrue(info["is_cent_account"])
        self.assertEqual(info["display_currency"], "USD")
        self.assertEqual(info["balance_major"], 100.0)
        self.assertEqual(info["equity_major"], 98.5)


class CentSymbolResolutionTests(unittest.TestCase):
    def tearDown(self):
        mt5_client._symbol_resolution.clear()

    def test_resolves_unsuffixed_gold_to_standard_cent_symbol(self):
        fake_mt5 = MagicMock()
        fake_mt5.symbols_get.return_value = [SimpleNamespace(name="XAUUSDc")]
        fake_mt5.symbol_select.side_effect = lambda name, _select: name == "XAUUSDc"

        with patch.object(mt5_client, "mt5", fake_mt5):
            resolved = mt5_client.resolve_symbol("XAUUSD")

        self.assertEqual(resolved, "XAUUSDc")

    def test_invalidates_cached_standard_symbol_after_account_switch(self):
        mt5_client._symbol_resolution["XAUUSD"] = "XAUUSDm"
        fake_mt5 = MagicMock()
        fake_mt5.symbols_get.return_value = [SimpleNamespace(name="XAUUSDc")]
        fake_mt5.symbol_select.side_effect = lambda name, _select: name == "XAUUSDc"

        with patch.object(mt5_client, "mt5", fake_mt5):
            resolved = mt5_client.resolve_symbol("XAUUSD")

        self.assertEqual(resolved, "XAUUSDc")


class CentLotSizingTests(unittest.TestCase):
    CENT_GOLD_INFO = {
        "digits": 2,
        "volume_min": 0.01,
        "volume_max": 200.0,
        "volume_step": 0.01,
        "trade_contract_size": 1.0,
        "trade_tick_size": 0.01,
        # MT5 reports this in the account currency: USC for a cent account.
        "trade_tick_value": 1.0,
        "point": 0.01,
    }

    @staticmethod
    def _recommendation():
        return Recommendation(
            symbol="XAUUSDc",
            timeframe="M30",
            price=4_000.0,
            action=Action.BUY,
            confidence=0.9,
            stop_loss=3_986.0,
            take_profit=4_028.0,
            indicators=IndicatorSnapshot(
                symbol="XAUUSDc", timeframe="M30", price=4_000.0,
                strategy_name="squeeze_breakout",
            ),
        )

    @patch("app.trader.settings")
    @patch("app.trader.mt5_client.account_info", return_value={"equity": 10_000.0})
    @patch("app.trader.mt5_client.symbol_info", return_value=CENT_GOLD_INFO)
    def test_sizes_gold_in_cent_lots_using_native_usc_values(
        self, _info, _account, settings_mock
    ):
        settings_mock.position_sizing_mode = "risk_pct"
        settings_mock.risk_per_trade = 0.005
        settings_mock.max_lot = 1.0
        settings_mock.min_lot_stake_multiple = 3.0
        settings_mock.max_notional_to_equity = 2.0

        def normalize(_symbol, lot):
            return max(0.01, min(200.0, int((lot + 1e-9) / 0.01) * 0.01))

        with patch("app.trader.mt5_client.normalize_lot", side_effect=normalize):
            lot = TradeManager().risk_lot("XAUUSDc", self._recommendation())

        # $100 account = 10,000 USC. 0.5% risk = 50 USC; a 14-dollar move
        # risks 1,400 USC per cent lot, so the normalized size is 0.03 cent lot.
        self.assertEqual(lot, 0.03)


if __name__ == "__main__":
    unittest.main()
