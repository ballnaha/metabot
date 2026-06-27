import unittest
from unittest.mock import patch

import pandas as pd

from app.backtest import backtest_strategy
from app.models import Action, StrategySignal


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


if __name__ == "__main__":
    unittest.main()
