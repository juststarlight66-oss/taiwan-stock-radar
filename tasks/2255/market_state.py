#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Market State Detection & Adaptive Dimension Weights

Detects current Taiwan market regime via TAIEX (^TWII) moving-average analysis
and returns the appropriate weight profile for the five-dimension scoring model.

States:
  Bull  — 10MA > 20MA and index above 60MA (trend-following)
  Range — neither bull nor bear (mean-reversion)
  Bear  — index below 60MA (defensive / value-oriented)

Weight philosophy:
  Bull:  chase momentum — higher technical (trends persist) + flow (institutional follow)
  Range: exploit mean-reversion — higher chips (volume breaks matter) + flow (margin signals)
  Bear:  capital preservation — higher fundamental (safety) + sentiment (oversold bounce) + flow (margin contraction)
"""

import json
import os
import warnings
from dataclasses import dataclass
from typing import Optional

import yfinance as yf

TAIEX_TICKER = "^TWII"

# ── Default per-state weight profiles (sum to 1.0) ──────────────────────
# Reflects learnings from 1944-stock analysis: profit_space has zero differentiating
# power (only 3 values), so omitted. chips & technical are the strongest differentiators.

STATE_WEIGHTS = {
    "bull": {
        "tech": 0.30,
        "chips": 0.15,
        "fundamental": 0.20,
        "news": 0.25,
        "sentiment": 0.10,
    },
    "range": {
        "tech": 0.20,
        "chips": 0.25,
        "fundamental": 0.20,
        "news": 0.25,
        "sentiment": 0.10,
    },
    "bear": {
        "tech": 0.15,
        "chips": 0.10,
        "fundamental": 0.30,
        "news": 0.25,
        "sentiment": 0.20,
    },
}

# ── Load overrides from dimension_weights.json if present ───────────────
_W = os.path.join(os.path.dirname(os.path.abspath(__file__)), "dimension_weights.json")
if os.path.exists(_W):
    try:
        with open(_W, "r", encoding="utf-8") as f:
            _ext = json.load(f)
        # Support both flat weights (legacy) and per-state profiles
        if "bull" in _ext or "range" in _ext or "bear" in _ext:
            for state in ("bull", "range", "bear"):
                if state in _ext and isinstance(_ext[state], dict):
                    for k in STATE_WEIGHTS[state]:
                        if k in _ext[state]:
                            STATE_WEIGHTS[state][k] = float(_ext[state][k])
    except Exception:
        pass


def _ma(values, period):
    """Simple Moving Average."""
    if len(values) < period:
        return None
    return sum(values[-period:]) / period


def compute_crossover_count(closes, ma10, ma20):
    """Count how many times 10MA and 20MA cross in the last 20 days.
    High crossover count → range-bound / choppy market."""
    crosses = 0
    if len(closes) < 22:
        return 0
    for i in range(1, 20):
        idx_cur = -(i)
        idx_prev = -(i + 1)
        m10_cur = _ma(closes[: idx_cur + 1], 10) if len(closes[: idx_cur + 1]) >= 10 else None
        m20_cur = _ma(closes[: idx_cur + 1], 20) if len(closes[: idx_cur + 1]) >= 20 else None
        m10_prev = _ma(closes[: idx_prev + 1], 10) if len(closes[: idx_prev + 1]) >= 10 else None
        m20_prev = _ma(closes[: idx_prev + 1], 20) if len(closes[: idx_prev + 1]) >= 20 else None
        if None in (m10_cur, m20_cur, m10_prev, m20_prev):
            continue
        if (m10_cur - m20_cur) * (m10_prev - m20_prev) < 0:
            crosses += 1
    return crosses


@dataclass
class MarketState:
    state: str          # "bull" | "range" | "bear"
    taiex_close: float
    ma10: Optional[float]
    ma20: Optional[float]
    ma60: Optional[float]
    crossover_count: int
    weights: dict


def detect_market_state() -> MarketState:
    """
    Fetch TAIEX daily data (6 months) and determine current market regime.

    Detection rules (priority order):
      1. TAIEX < 60MA  →  bear (defensive)
      2. 10MA > 20MA AND TAIEX >= 60MA  →  bull (trend)
      3. Otherwise  →  range (choppy / mean-reversion)
    """
    warnings.filterwarnings("ignore")
    try:
        ticker = yf.Ticker(TAIEX_TICKER)
        df = ticker.history(period="6mo")
        if df.empty:
            raise ValueError("No TAIEX data")
    except Exception:
        # Fallback: assume range (neutral) if yfinance fails
        return MarketState(
            state="range",
            taiex_close=0.0,
            ma10=None, ma20=None, ma60=None,
            crossover_count=0,
            weights=STATE_WEIGHTS["range"],
        )

    closes = df["Close"].tolist()
    if len(closes) < 60:
        return MarketState(
            state="range",
            taiex_close=closes[-1],
            ma10=None, ma20=None, ma60=None,
            crossover_count=0,
            weights=STATE_WEIGHTS["range"],
        )

    taiex_close = closes[-1]
    ma10_val = _ma(closes, 10)
    ma20_val = _ma(closes, 20)
    ma60_val = _ma(closes, 60)
    cross_count = compute_crossover_count(closes, ma10_val, ma20_val)

    # Detection
    if ma60_val is not None and taiex_close < ma60_val:
        state = "bear"
    elif (ma10_val is not None and ma20_val is not None
          and ma10_val > ma20_val and ma60_val is not None
          and taiex_close >= ma60_val):
        state = "bull"
    else:
        state = "range"

    return MarketState(
        state=state,
        taiex_close=round(taiex_close, 2),
        ma10=round(ma10_val, 2) if ma10_val else None,
        ma20=round(ma20_val, 2) if ma20_val else None,
        ma60=round(ma60_val, 2) if ma60_val else None,
        crossover_count=cross_count,
        weights=STATE_WEIGHTS[state],
    )


def get_adaptive_weights() -> dict:
    """Convenience: returns the active weight dict for the current market state."""
    ms = detect_market_state()
    return ms.weights
