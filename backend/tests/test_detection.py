"""Tests for stock symbol detection across broker naming schemes.

Detection reads MT5 symbol paths, which differ by broker (XM puts US stocks
under Stocks\\US\\Apple; Exness uses Standard\\Stocks\\AAPLm). These tests fake
the symbol list so they run without a terminal.
"""
import types
import unittest
from unittest.mock import patch


def _sym(name, path, trade_mode=4):
    return types.SimpleNamespace(name=name, path=path, trade_mode=trade_mode)


# A realistic mixed symbol universe: Exness-style stocks + forex + crypto + gold.
EXNESS_SYMBOLS = [
    _sym("AAPLm", "Standard\\Stocks\\AAPLm"),
    _sym("MSFTm", "Standard\\Stocks\\MSFTm"),
    _sym("ABBVm", "Standard\\Stocks\\ABBVm"),
    _sym("Vm", "Standard\\Stocks\\Vm"),
    _sym("EURUSDm", "Standard\\Forex\\EURUSDm"),
    _sym("USDJPYm", "Standard\\Forex\\USDJPYm"),
    _sym("BTCUSDm", "Standard\\Crypto\\BTCUSDm"),
    _sym("XAUUSDm", "Standard\\Metals\\XAUUSDm"),
]

XM_SYMBOLS = [
    _sym("Apple", "Stocks\\US\\Apple"),
    _sym("Microsoft", "Stocks\\US\\Microsoft"),
    _sym("EURUSD", "Forex\\Majors\\EURUSD"),
]


class StockDetectionTests(unittest.TestCase):
    def _detect(self, symbols, filter_type):
        # Patch the MT5 module used inside the endpoint + the connect call.
        fake_mt5 = types.SimpleNamespace(symbols_get=lambda: symbols)
        with patch("app.api.mt5_client.connect", return_value=None), \
             patch.dict("sys.modules", {"MetaTrader5": fake_mt5}):
            from app.api import detect_stock_symbols
            return detect_stock_symbols(filter_type)["symbols"]

    def test_exness_stocks_detected_under_stocks_path(self):
        # All four equities are found; forex/crypto/gold are excluded.
        got = self._detect(EXNESS_SYMBOLS, "all")
        self.assertIn("AAPLm", got)
        self.assertIn("MSFTm", got)
        self.assertIn("Vm", got)
        self.assertNotIn("EURUSDm", got)
        self.assertNotIn("BTCUSDm", got)
        self.assertNotIn("XAUUSDm", got)

    def test_liquid_30_preset_strips_m_suffix_to_match(self):
        # AAPLm -> AAPL is in LIQUID_30; ABBVm -> ABBV is not.
        got = self._detect(EXNESS_SYMBOLS, "liquid_30")
        self.assertIn("AAPLm", got)
        self.assertIn("MSFTm", got)
        self.assertNotIn("ABBVm", got)

    def test_xm_stocks_still_detected(self):
        # Regression: the original XM Stocks\US\ path must still work.
        got = self._detect(XM_SYMBOLS, "all")
        self.assertIn("Apple", got)
        self.assertIn("Microsoft", got)
        self.assertNotIn("EURUSD", got)


if __name__ == "__main__":
    unittest.main()
