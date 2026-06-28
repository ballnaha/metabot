import unittest
from unittest.mock import patch

import pandas as pd

from app.models import Action, IndicatorSnapshot
from app.strategy import (
    BreakoutStrategy,
    CryptoRegimeStrategy,
    EmaMacdRsiStrategy,
    TrendFollowStrategy,
)


class StrategyTests(unittest.TestCase):
    def test_crypto_regime_accepts_the_live_200_bar_window(self):
        rows = 200
        close = pd.Series([100.0 + i * 0.2 for i in range(rows)])
        df = pd.DataFrame({
            "open": close - 0.05,
            "high": close + 0.2,
            "low": close - 0.2,
            "close": close,
            "tick_volume": [100] * rows,
        })
        snap = IndicatorSnapshot(
            symbol="BTCUSD", timeframe="H4", price=float(close.iloc[-2]),
            atr=0.4, rsi=60.0,
        )

        signal = CryptoRegimeStrategy().evaluate(df, snap)

        self.assertGreater(signal.confidence, 0.0)
        self.assertTrue(signal.reasons)

    def test_crypto_regime_rejects_an_incomplete_warmup(self):
        rows = 199
        df = pd.DataFrame({
            "open": [100.0] * rows, "high": [101.0] * rows,
            "low": [99.0] * rows, "close": [100.0] * rows,
            "tick_volume": [100] * rows,
        })
        snap = IndicatorSnapshot(symbol="BTCUSD", timeframe="H4", price=100.0)

        signal = CryptoRegimeStrategy().evaluate(df, snap)

        self.assertEqual(signal.action, Action.HOLD)
        self.assertEqual(signal.confidence, 0.0)

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


class TrendLookAheadTests(unittest.TestCase):
    """The trend strategy must evaluate the closed candle (-2), ignoring the
    still-forming candle (-1). Mutating only -1 must not change the signal."""

    def _df(self):
        rows = 60
        # Steady uptrend so the closed-candle signal is a clear BUY.
        close = [100.0 + i * 0.5 for i in range(rows)]
        return pd.DataFrame(
            {
                "open": close,
                "high": [c + 0.2 for c in close],
                "low": [c - 0.2 for c in close],
                "close": close,
                "tick_volume": [100] * rows,
            }
        )

    def _snap(self, price):
        return IndicatorSnapshot(symbol="BTCUSD", timeframe="H4", price=price, atr=1.0, macd_hist=0.5)

    def test_forming_candle_does_not_change_signal(self):
        df = self._df()
        snap = self._snap(price=float(df["close"].iloc[-2]))

        base = TrendFollowStrategy().evaluate(df, snap)

        # Corrupt ONLY the forming candle (-1) with a wild spike.
        df.loc[len(df) - 1, ["open", "high", "low", "close"]] = [9999, 9999, 9999, 9999]
        after = TrendFollowStrategy().evaluate(df, snap)

        self.assertEqual(base.action, after.action)
        self.assertAlmostEqual(base.confidence, after.confidence)


class CryptoSlFloorTests(unittest.TestCase):
    """A shrunk ATR must not yield an SL tighter than the configured floor."""

    def _snap(self):
        # ATR is tiny (0.1% of price): 1.8×ATR = 0.18 → SL 0.18% of price.
        return IndicatorSnapshot(symbol="BTCUSD", timeframe="H4", price=100.0, atr=0.1)

    @patch("app.strategy.settings")
    def test_floor_widens_tight_atr_sl(self, settings_mock):
        settings_mock.crypto_atr_sl_mult = 1.8
        settings_mock.crypto_rr = 2.0
        settings_mock.crypto_min_sl_pct = 0.018  # floor = 1.8% of price = 1.80

        sl, tp = EmaMacdRsiStrategy().atr_levels(self._snap(), Action.BUY)
        # Without the floor SL would be 100 - 0.18 = 99.82; the floor forces 1.80.
        self.assertAlmostEqual(sl, 98.20)
        # R:R preserved: TP distance = SL distance × rr = 1.80 × 2.0 = 3.60.
        self.assertAlmostEqual(tp, 103.60)

    @patch("app.strategy.settings")
    def test_no_floor_when_disabled(self, settings_mock):
        settings_mock.crypto_atr_sl_mult = 1.8
        settings_mock.crypto_rr = 2.0
        settings_mock.crypto_min_sl_pct = 0.0  # disabled

        sl, _tp = EmaMacdRsiStrategy().atr_levels(self._snap(), Action.BUY)
        self.assertAlmostEqual(sl, 99.82)  # raw ATR-based SL, unfloored

    @patch("app.strategy.settings")
    def test_floor_is_per_group(self, settings_mock):
        # Forex uses its OWN floor setting, not crypto's. EURUSD ATR tiny → SL
        # would be 1.5×0.001 = 0.0015 (0.0015%); forex floor 0.15% forces 0.0015.
        settings_mock.forex_atr_sl_mult = 1.5
        settings_mock.forex_rr = 2.0
        settings_mock.forex_min_sl_pct = 0.0015  # 0.15% of price
        settings_mock.crypto_min_sl_pct = 0.018  # must be ignored for forex

        snap = IndicatorSnapshot(symbol="EURUSD", timeframe="H1", price=1.0, atr=0.0001)
        sl, _tp = EmaMacdRsiStrategy().atr_levels(snap, Action.BUY)
        # Raw = 1.5×0.0001 = 0.00015; floor = 1.0×0.0015 = 0.0015 → SL 0.9985.
        self.assertAlmostEqual(sl, 0.9985)


if __name__ == "__main__":
    unittest.main()
