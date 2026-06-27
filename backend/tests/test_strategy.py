import unittest

import pandas as pd

from app.models import Action, IndicatorSnapshot
from app.strategy import BreakoutStrategy


class StrategyTests(unittest.TestCase):
    def test_breakout_excludes_the_candle_being_evaluated(self):
        rows = 30
        df = pd.DataFrame(
            {
                "open": [99.0] * rows,
                "high": [100.0] * rows,
                "low": [98.0] * rows,
                "close": [99.0] * rows,
                "tick_volume": [100] * rows,
            }
        )
        # -2 is the evaluated closed candle; -1 is still forming.
        df.loc[rows - 2, ["open", "high", "low", "close"]] = [99.5, 102.0, 99.0, 101.0]
        snap = IndicatorSnapshot(
            symbol="BTCUSD",
            timeframe="H1",
            price=101.0,
            atr=1.0,
            macd_hist=0.0,
        )

        signal = BreakoutStrategy().evaluate(df, snap)

        self.assertEqual(signal.action, Action.BUY)
        self.assertTrue(any("break above" in reason for reason in signal.reasons))


if __name__ == "__main__":
    unittest.main()
