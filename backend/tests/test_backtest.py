import unittest
from unittest.mock import patch

import pandas as pd

from app.backtest import backtest_strategy, run_symbol_backtest
from app.models import Action, StrategySignal


def _flat_df(rows: int = 60) -> pd.DataFrame:
    return pd.DataFrame(
        {
            "open": [100.0] * rows,
            "high": [100.5] * rows,
            "low": [99.5] * rows,
            "close": [100.0] * rows,
            "tick_volume": [100] * rows,
        }
    )


class BacktestTests(unittest.TestCase):
    def test_enters_on_next_bar_and_uses_conservative_same_bar_fill(self):
        rows = 55
        df = pd.DataFrame(
            {
                "open": [100.0] * rows,
                "high": [100.5] * rows,
                "low": [99.5] * rows,
                "close": [100.0] * rows,
                "tick_volume": [100] * rows,
            }
        )
        # Entry is bar 51. It touches both rebased SL=99 and TP=102.
        df.loc[51, "high"] = 103.0
        df.loc[51, "low"] = 98.0
        signal = StrategySignal(
            action=Action.BUY,
            confidence=0.8,
            stop_loss=99.0,
            take_profit=102.0,
            reasons=["test"],
        )

        with patch("app.backtest.strategy.apply", return_value=signal):
            result = backtest_strategy(
                df, "BTCUSD", "H1", "test", warmup_bars=50, max_hold_bars=2
            )

        trade = result["details"][0]
        self.assertEqual(trade["signal_index"], 50)
        self.assertEqual(trade["entry_index"], 51)
        self.assertEqual(trade["reason"], "sl")
        self.assertEqual(trade["r"], -1.0)


class RunSymbolBacktestTests(unittest.TestCase):
    """run_symbol_backtest wires MT5 data + group defaults into backtest_strategy."""

    SYMBOL_INFO = {"spread": 20, "point": 0.01}  # spread_price = 20 * 0.01 = 0.2

    @patch("app.backtest.mt5_client.symbol_info")
    @patch("app.backtest.mt5_client.get_rates")
    @patch("app.backtest.settings")
    def test_defaults_timeframe_and_strategy_from_group(self, settings_mock, get_rates, sym_info):
        settings_mock.crypto_timeframe = "H4"
        settings_mock.crypto_strategy = "crypto_regime"
        settings_mock.crypto_max_spread_to_sl = 0.5
        settings_mock.max_entry_drift_to_sl = 0.75
        get_rates.return_value = _flat_df()
        sym_info.return_value = self.SYMBOL_INFO

        with patch("app.backtest.market_group", return_value="crypto"), \
             patch("app.backtest.backtest_strategy", return_value={"strategy": "crypto_regime"}) as bt:
            result = run_symbol_backtest("BTCUSD")

        # get_rates was asked for the crypto timeframe.
        get_rates.assert_called_once_with("BTCUSD", "H4", 1000)
        # backtest_strategy got the group's strategy + computed spread + caps.
        kwargs = bt.call_args.kwargs
        self.assertEqual(bt.call_args.args[3], "crypto_regime")
        self.assertAlmostEqual(kwargs["spread_price"], 0.2)
        self.assertEqual(kwargs["max_spread_to_sl"], 0.5)
        # Enriched fields are attached.
        self.assertEqual(result["timeframe"], "H4")
        self.assertEqual(result["bars"], 60)

    @patch("app.backtest.mt5_client.symbol_info", return_value={"spread": 0, "point": 0.0})
    @patch("app.backtest.mt5_client.get_rates")
    @patch("app.backtest.settings")
    def test_explicit_overrides_and_details_stripped(self, settings_mock, get_rates, _info):
        settings_mock.max_spread_to_sl = 0.25
        settings_mock.max_entry_drift_to_sl = 0.75
        get_rates.return_value = _flat_df()

        signal = StrategySignal(action=Action.HOLD, confidence=0.0)
        with patch("app.backtest.market_group", return_value="forex"), \
             patch("app.backtest.strategy.apply", return_value=signal):
            result = run_symbol_backtest(
                "EURUSD", timeframe="M30", strategy_name="trend", bars=60
            )

        get_rates.assert_called_once_with("EURUSD", "M30", 60)
        self.assertEqual(result["strategy"], "trend")
        self.assertEqual(result["timeframe"], "M30")
        # include_details defaults to False → no per-trade list in the result.
        self.assertNotIn("details", result)


if __name__ == "__main__":
    unittest.main()
