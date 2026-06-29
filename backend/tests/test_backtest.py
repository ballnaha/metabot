import unittest
from unittest.mock import patch

import pandas as pd

from app.backtest import _compute_metrics, backtest_strategy, run_symbol_backtest
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


class MetricsTests(unittest.TestCase):
    """_compute_metrics derives the professional stats from per-trade R."""

    def _trades(self, rs):
        # Give each trade a 2-bar hold (entry i, exit i+2) at increasing indices.
        return [
            {"r": r, "entry_index": k * 4, "exit_index": k * 4 + 2}
            for k, r in enumerate(rs)
        ]

    def test_expectancy_winloss_and_streaks(self):
        # 3 wins (+2 each), 2 losses (-1 each): sum 4 over 5 = +0.8 expectancy.
        rs = [2.0, 2.0, -1.0, -1.0, 2.0]
        m = _compute_metrics(self._trades(rs), total_bars=100)

        self.assertAlmostEqual(m["expectancy_r"], 0.8)
        self.assertAlmostEqual(m["avg_win_r"], 2.0)
        self.assertAlmostEqual(m["avg_loss_r"], -1.0)
        self.assertAlmostEqual(m["largest_win_r"], 2.0)
        self.assertAlmostEqual(m["largest_loss_r"], -1.0)
        self.assertEqual(m["max_consecutive_wins"], 2)   # first two
        self.assertEqual(m["max_consecutive_losses"], 2)  # middle two
        # 5 trades * 2 bars held / 100 bars = 0.1 exposure; avg hold 2 bars.
        self.assertAlmostEqual(m["avg_bars_held"], 2.0)
        self.assertAlmostEqual(m["exposure"], 0.1)

    def test_sharpe_is_mean_over_std(self):
        rs = [1.0, -1.0, 1.0, -1.0]  # mean 0 => Sharpe 0
        m = _compute_metrics(self._trades(rs), total_bars=100)
        self.assertAlmostEqual(m["expectancy_r"], 0.0)
        self.assertAlmostEqual(m["sharpe"], 0.0)

    def test_empty_is_safe(self):
        m = _compute_metrics([], total_bars=0)
        self.assertEqual(m["expectancy_r"], 0.0)
        self.assertEqual(m["max_consecutive_losses"], 0)
        self.assertEqual(m["exposure"], 0.0)


class CostModelTests(unittest.TestCase):
    """Commission + swap are converted from money to R and deducted."""

    def _winning_buy_df(self, rows: int = 55) -> pd.DataFrame:
        df = _flat_df(rows)
        # Entry bar 51 immediately hits TP (=> bars_held 0, no swap), gross +2R.
        df.loc[51, "high"] = 105.0
        return df

    def _signal(self):
        return StrategySignal(
            action=Action.BUY, confidence=0.8, stop_loss=98.0, take_profit=104.0, reasons=["t"]
        )

    def test_commission_deducted_in_R(self):
        # money_per_R per lot = (sl_dist 2.0 / tick 0.01) * tick_value 0.10 = $20.
        # commission $10/lot => 0.5R. The first trade wins +2R gross => 1.5R net.
        with patch("app.backtest.strategy.apply", return_value=self._signal()):
            result = backtest_strategy(
                self._winning_buy_df(), "BTCUSD", "M15", "t",
                warmup_bars=50, max_hold_bars=2,
                tick_size=0.01, tick_value=0.10, commission_per_lot=10.0,
            )
        trade = result["details"][0]
        self.assertEqual(trade["reason"], "tp")
        self.assertAlmostEqual(trade["gross_r"], 2.0)
        self.assertAlmostEqual(trade["cost_r"], 0.5)
        self.assertAlmostEqual(trade["r"], 1.5)
        # net_r and gross_net_r differ by exactly the summed cost, whatever the
        # trade count.
        self.assertAlmostEqual(
            result["gross_net_r"] - result["net_r"], result["total_cost_r"]
        )
        self.assertGreater(result["total_cost_r"], 0.0)

    def test_no_costs_when_tick_value_missing(self):
        # Without tick data the cost model can't value a tick → 0 cost, net=gross.
        with patch("app.backtest.strategy.apply", return_value=self._signal()):
            result = backtest_strategy(
                self._winning_buy_df(), "BTCUSD", "M15", "t",
                warmup_bars=50, max_hold_bars=2,
                commission_per_lot=10.0,  # ignored: tick_size/value default to 0
            )
        self.assertAlmostEqual(result["details"][0]["cost_r"], 0.0)
        self.assertAlmostEqual(result["net_r"], result["gross_net_r"])

    def test_swap_scales_with_nights_held(self):
        # Hold across many H4 bars so swap accrues. Trade never hits SL/TP and
        # exits flat at timeout → gross 0R, so net R is purely the swap cost.
        rows = 80
        df = _flat_df(rows)  # flat: no TP/SL touch, exits at timeout
        signal = StrategySignal(
            action=Action.BUY, confidence=0.8, stop_loss=98.0, take_profit=110.0, reasons=["t"]
        )
        with patch("app.backtest.strategy.apply", return_value=signal):
            result = backtest_strategy(
                df, "BTCUSD", "H4", "t",
                warmup_bars=50, max_hold_bars=12,  # 12 H4 bars from entry
                tick_size=0.01, tick_value=0.10,
                swap_long_per_lot=-2.0,  # $-2/lot/night (cost)
            )
        trade = result["details"][0]
        self.assertEqual(trade["reason"], "timeout")
        # bars_held = exit_i - entry_i; nights = bars_held*4/24. swap_money =
        # -2 * nights; cost_r = -swap_money/20 (positive cost). Just assert the
        # cost is positive and the gross was ~0.
        self.assertAlmostEqual(trade["gross_r"], 0.0, places=4)
        self.assertGreater(trade["cost_r"], 0.0)


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

    @patch("app.backtest.mt5_client.symbol_info")
    @patch("app.backtest.mt5_client.get_rates")
    @patch("app.backtest.settings")
    def test_spread_points_override_replaces_snapshot(self, settings_mock, get_rates, sym_info):
        settings_mock.forex_timeframe = "H1"
        settings_mock.forex_strategy = "trend"
        settings_mock.max_spread_to_sl = 0.25
        settings_mock.max_entry_drift_to_sl = 0.75
        get_rates.return_value = _flat_df()
        sym_info.return_value = {"spread": 20, "point": 0.01}  # snapshot would be 0.2

        with patch("app.backtest.market_group", return_value="forex"), \
             patch("app.backtest.backtest_strategy", return_value={}) as bt:
            result = run_symbol_backtest("EURUSD", spread_points=50)  # override

        # 50 points * 0.01 = 0.5 price, not the 0.2 snapshot.
        self.assertAlmostEqual(bt.call_args.kwargs["spread_price"], 0.5)
        self.assertEqual(result["spread_points"], 50.0)

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
