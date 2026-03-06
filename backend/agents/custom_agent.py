from __future__ import annotations

"""
Custom Agent – user-defined strategy via JSON recipe.

This agent is an **autonomous, goal-driven, rule-based decision maker**
whose strategy is defined by a JSON "recipe" built in the frontend Builder.

Security note: NO eval(), exec(), or raw code injection is used.
The recipe is a structured dict that is parsed into safe rule checks
against pre-defined indicator keys and arithmetic comparisons.

Supported recipe format (V1)
-----------------------------
{
  "mode": "basic" | "advanced",

  -- BASIC MODE: simple indicator crossover/threshold rules --
  "basic": {
    "entry_rule": "sma_crossover" | "bb_oversold" | "price_vs_sma",
    "exit_rule":  "sma_death_cross" | "bb_overbought" | "stop_loss",
    "position_size_pct": <float 0-1>
  },

  -- ADVANCED MODE: IF-THEN condition blocks --
  "advanced": {
    "rules": [
      {
        "conditions": [
          { "indicator": "<key>", "op": "<", "value": <number> },
          ...
        ],
        "logic": "AND" | "OR",   // how to combine conditions (default AND)
        "action": "BUY" | "SELL" | "HOLD",
        "size_pct": <float>       // fraction of cash / position to trade
      },
      ...
    ]
  }
}

Supported indicator keys (mapped from current_bar):
  price, sma20, sma50, bb_up, bb_low, bb_mid, volatility,
  volume, held_qty, cash_ratio (cash / initial_cash)

Supported ops: "<", "<=", ">", ">=", "==", "!="
"""

import json
import requests
import logging

from agents.base_agent import TradingAgent

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Ollama LLM helpers
# ---------------------------------------------------------------------------

OLLAMA_URL = "http://localhost:11434/api/generate"
DEFAULT_MODEL = "qwen2.5:3b"

_LLM_SYSTEM_PROMPT = """You are a stock trading AI. Respond with ONLY JSON.
Format: {"action":"BUY"|"SELL"|"HOLD","confidence":0.0-1.0,"reasoning":"brief"}
Use SMA crossover, Bollinger Bands, volatility. Be concise (under 40 words)."""


def _warmup_model(model: str) -> None:
    """Send a tiny request to pre-load the model into VRAM (avoids cold-start)."""
    try:
        logger.info("[LLM] Pre-warming model %s ...", model)
        requests.post(
            OLLAMA_URL,
            json={
                "model": model,
                "prompt": "hi",
                "stream": False,
                "keep_alive": "30m",
                "options": {"num_predict": 1},
            },
            timeout=120,
        )
        logger.info("[LLM] Model %s is warm and ready.", model)
    except Exception as e:
        logger.warning("[LLM] Warmup failed: %s", e)


def _call_ollama(model: str, prompt: str, timeout: float = 90.0) -> dict:
    """Call Ollama generate API and parse the JSON response."""
    try:
        resp = requests.post(
            OLLAMA_URL,
            json={
                "model": model,
                "prompt": prompt,
                "system": _LLM_SYSTEM_PROMPT,
                "stream": False,
                "keep_alive": "30m",
                "options": {
                    "temperature": 0.2,
                    "num_predict": 120,
                    "top_p": 0.9,
                },
            },
            timeout=timeout,
        )
        resp.raise_for_status()
        raw = resp.json().get("response", "")
        logger.info(f"[LLM raw] {raw[:300]}")

        # Try to extract JSON from the response
        # Sometimes LLMs wrap it in ```json ...```
        cleaned = raw.strip()
        if "```" in cleaned:
            start = cleaned.find("{")
            end = cleaned.rfind("}") + 1
            if start >= 0 and end > start:
                cleaned = cleaned[start:end]
        
        parsed = json.loads(cleaned)
        return {
            "action": str(parsed.get("action", "HOLD")).upper(),
            "confidence": float(parsed.get("confidence", 0.5)),
            "reasoning": str(parsed.get("reasoning", "LLM provided no reasoning.")),
        }
    except requests.exceptions.ConnectionError:
        logger.error("Ollama not reachable at %s", OLLAMA_URL)
        return {"action": "HOLD", "confidence": 0.0, "reasoning": "LLM unreachable (Ollama not running?)"}
    except requests.exceptions.Timeout:
        logger.error("Ollama request timed out")
        return {"action": "HOLD", "confidence": 0.0, "reasoning": "LLM request timed out"}
    except (json.JSONDecodeError, ValueError, KeyError) as e:
        logger.error("Failed to parse LLM response: %s — raw: %s", e, raw[:200])
        return {"action": "HOLD", "confidence": 0.0, "reasoning": f"LLM response parse error: {e}"}
    except Exception as e:
        logger.error("Unexpected LLM error: %s", e)
        return {"action": "HOLD", "confidence": 0.0, "reasoning": f"LLM error: {e}"}


# ---------------------------------------------------------------------------
# Indicator resolution helpers
# ---------------------------------------------------------------------------

_OPS = {
    "<":  lambda a, b: a < b,
    "<=": lambda a, b: a <= b,
    ">":  lambda a, b: a > b,
    ">=": lambda a, b: a >= b,
    "==": lambda a, b: abs(a - b) < 1e-9,
    "!=": lambda a, b: abs(a - b) >= 1e-9,
}

_BASIC_ENTRY_RULES = {
    "sma_crossover",
    "bb_oversold",
    "price_vs_sma",
}

_BASIC_EXIT_RULES = {
    "sma_death_cross",
    "bb_overbought",
    "stop_loss",
}


def _resolve_indicator(key: str, obs: dict) -> float:
    """Map an indicator key to its current numeric value from obs dict."""
    mapping = {
        "price":      obs.get("close", 0.0),
        "sma20":      obs.get("sma20", obs.get("close", 0.0)),
        "sma50":      obs.get("sma50", obs.get("close", 0.0)),
        "bb_up":      obs.get("bb_up", obs.get("close", 0.0)),
        "bb_low":     obs.get("bb_low", obs.get("close", 0.0)),
        "bb_mid":     obs.get("bb_mid", obs.get("close", 0.0)),
        "volatility": obs.get("volatility", 0.0),
        "volume":     obs.get("volume", 0.0),
        "held_qty":   obs.get("held_qty", 0.0),
        "cash_ratio": obs.get("cash_ratio", 1.0),
    }
    return float(mapping.get(key, 0.0))


def _eval_condition(cond: dict, obs: dict) -> bool:
    """Safely evaluate a single condition dict against observations."""
    indicator = str(cond.get("indicator", ""))
    op = str(cond.get("op", "<"))
    try:
        value = float(cond.get("value", 0))
    except (TypeError, ValueError):
        return False

    fn = _OPS.get(op)
    if fn is None:
        return False

    current = _resolve_indicator(indicator, obs)
    return fn(current, value)


# ---------------------------------------------------------------------------
# CustomAgent class
# ---------------------------------------------------------------------------

class CustomAgent(TradingAgent):
    """
    Dynamic custom strategy agent built from a JSON recipe.
    Inherits all base properties including the followers mechanic.
    """

    def __init__(self, name: str = "Custom", initial_cash: float = 100_000.0, params: dict | None = None):
        super().__init__(name, initial_cash)
        params = params or {}
        self.followers = int(params.get("followers", 1))
        self._recipe: dict = params.get("recipe", {})
        self.goal = params.get("goal", "User-defined custom strategy")

        # Default position size if not specified in recipe
        self._default_size = float(params.get("position_size_pct", 0.10))

        # LLM settings (populated from recipe when mode == "llm")
        llm_cfg = self._recipe.get("llm", {})
        self._llm_model = llm_cfg.get("model", DEFAULT_MODEL)
        self._llm_style = llm_cfg.get("style", "balanced")
        self._llm_custom_prompt = llm_cfg.get("custom_prompt", "")
        self._llm_timeout = float(llm_cfg.get("timeout", 90))

        # LLM response cache — re-query only every N steps to avoid slowdown
        self._llm_call_interval = int(llm_cfg.get("call_interval", 3))  # query LLM every N steps
        self._llm_step_counter = 0
        self._llm_cached_decision: dict | None = None

        # Pre-warm the model into VRAM on agent creation (avoids cold-start timeout)
        if self._recipe.get("mode") == "llm":
            import threading
            threading.Thread(target=_warmup_model, args=(self._llm_model,), daemon=True).start()

    # -- perceive -----------------------------------------------------------

    def perceive(self, market_state: dict) -> dict:
        super().perceive(market_state)
        bar = market_state.get("current_bar", {})
        ticker = bar.get("ticker", "")
        close = bar.get("Close", 0.0)
        sma20  = bar.get("SMA20", close)
        sma50  = bar.get("SMA50", close)
        bb_mid = bar.get("BB_MID", close)
        bb_up  = bar.get("BB_UP", close)
        bb_low = bar.get("BB_LOW", close)
        vol    = bar.get("Volatility", 0.0)
        volume = bar.get("Volume", 0.0)

        return {
            "ticker":     ticker,
            "close":      close,
            "sma20":      sma20,
            "sma50":      sma50,
            "bb_mid":     bb_mid,
            "bb_up":      bb_up,
            "bb_low":     bb_low,
            "volatility": vol,
            "volume":     volume,
            "held_qty":   self.positions.get(ticker, 0),
            "cash_ratio": self.cash / self.initial_cash if self.initial_cash > 0 else 1.0,
        }

    # -- reason (dispatch to mode) ------------------------------------------

    def reason(self, observation: dict) -> dict:
        if not observation or not observation.get("ticker"):
            return {"action": "HOLD", "ticker": "", "quantity": 0, "reasoning": "No valid observation"}

        mode = self._recipe.get("mode", "basic")
        if mode == "llm":
            return self._reason_llm(observation)
        elif mode == "advanced":
            return self._reason_advanced(observation)
        return self._reason_basic(observation)

    # -- BASIC mode ---------------------------------------------------------

    def _reason_basic(self, obs: dict) -> dict:
        ticker   = obs["ticker"]
        close    = obs["close"]
        sma20    = obs["sma20"]
        sma50    = obs["sma50"]
        bb_up    = obs["bb_up"]
        bb_low   = obs["bb_low"]
        held_qty = obs["held_qty"]

        basic = self._recipe.get("basic", {})
        entry_rule = basic.get("entry_rule", "sma_crossover")
        exit_rule  = basic.get("exit_rule", "sma_death_cross")
        size_pct   = float(basic.get("position_size_pct", self._default_size))

        # --- Exit check (priority) ---
        if held_qty > 0:
            exit_triggered = False
            exit_reason = ""

            if exit_rule == "sma_death_cross" and sma20 < sma50:
                exit_triggered = True
                exit_reason = f"SMA death-cross (SMA20 {sma20:.2f} < SMA50 {sma50:.2f})"
            elif exit_rule == "bb_overbought" and close > bb_up:
                exit_triggered = True
                exit_reason = f"Price {close:.2f} above BB upper {bb_up:.2f}"
            elif exit_rule == "stop_loss":
                avg_cost = self.avg_cost.get(ticker, close)
                stop_thresh = float(basic.get("stop_loss_pct", 0.05))
                if close < avg_cost * (1 - stop_thresh):
                    exit_triggered = True
                    exit_reason = f"Stop-loss triggered at {close:.2f} (cost {avg_cost:.2f})"

            if exit_triggered:
                return {
                    "action": "SELL", "ticker": ticker, "quantity": held_qty,
                    "reasoning": f"Custom exit – {exit_rule}: {exit_reason}"
                }

        # --- Entry check ---
        if held_qty == 0:
            entry_triggered = False
            entry_reason = ""

            if entry_rule == "sma_crossover" and sma20 > sma50:
                entry_triggered = True
                entry_reason = f"SMA golden-cross (SMA20 {sma20:.2f} > SMA50 {sma50:.2f})"
            elif entry_rule == "bb_oversold" and close < bb_low:
                entry_triggered = True
                entry_reason = f"Price {close:.2f} below BB lower {bb_low:.2f}"
            elif entry_rule == "price_vs_sma" and close > sma20:
                entry_triggered = True
                entry_reason = f"Price {close:.2f} above SMA20 {sma20:.2f}"

            if entry_triggered and close > 0:
                qty = int((self.cash * size_pct) / close)
                if qty > 0:
                    return {
                        "action": "BUY", "ticker": ticker, "quantity": qty,
                        "reasoning": f"Custom entry – {entry_rule}: {entry_reason}"
                    }

        return {
            "action": "HOLD", "ticker": ticker, "quantity": 0,
            "reasoning": "Custom strategy: no trigger matched"
        }

    # -- ADVANCED mode ------------------------------------------------------

    def _reason_advanced(self, obs: dict) -> dict:
        ticker = obs["ticker"]
        close  = obs["close"]
        rules  = self._recipe.get("advanced", {}).get("rules", [])

        for rule in rules:
            conditions = rule.get("conditions", [])
            logic      = str(rule.get("logic", "AND")).upper()
            action     = str(rule.get("action", "HOLD")).upper()
            size_pct   = float(rule.get("size_pct", self._default_size))

            if not conditions:
                continue

            results = [_eval_condition(c, obs) for c in conditions]
            triggered = all(results) if logic == "AND" else any(results)

            if triggered:
                if action == "BUY" and close > 0:
                    qty = int((self.cash * size_pct) / close)
                    if qty > 0:
                        return {
                            "action": "BUY", "ticker": ticker, "quantity": qty,
                            "reasoning": f"Custom rule matched ({logic}): BUY {size_pct*100:.0f}% of cash"
                        }

                elif action == "SELL":
                    held_qty = obs.get("held_qty", 0)
                    sell_qty = max(1, int(held_qty * size_pct)) if held_qty > 0 else 0
                    if sell_qty > 0:
                        return {
                            "action": "SELL", "ticker": ticker, "quantity": sell_qty,
                            "reasoning": f"Custom rule matched ({logic}): SELL {size_pct*100:.0f}% of position"
                        }

                elif action == "HOLD":
                    return {
                        "action": "HOLD", "ticker": ticker, "quantity": 0,
                        "reasoning": f"Custom rule matched ({logic}): explicit HOLD"
                    }

        return {
            "action": "HOLD", "ticker": ticker, "quantity": 0,
            "reasoning": "Advanced custom strategy: no rule matched"
        }

    # -- LLM mode -----------------------------------------------------------

    def _reason_llm(self, obs: dict) -> dict:
        """Use a local LLM via Ollama to decide the trading action."""
        ticker = obs["ticker"]
        close  = obs["close"]
        held_qty = obs.get("held_qty", 0)

        # ---- Cache: reuse last LLM decision for N steps to avoid slowdown ----
        self._llm_step_counter += 1
        if (self._llm_cached_decision is not None
                and self._llm_step_counter % self._llm_call_interval != 0):
            cached = self._llm_cached_decision.copy()
            # Recalculate quantity with current prices/portfolio
            cached["ticker"] = ticker
            action = cached["action"]
            if action == "BUY" and close > 0:
                size_pct = self._default_size * cached.get("_confidence", 0.5)
                qty = int((self.cash * size_pct) / close)
                cached["quantity"] = qty if qty > 0 else 0
                if qty <= 0:
                    cached["action"] = "HOLD"
            elif action == "SELL":
                qty = max(1, int(held_qty * cached.get("_confidence", 0.5))) if held_qty > 0 else 0
                cached["quantity"] = qty
                if qty <= 0:
                    cached["action"] = "HOLD"
            cached["reasoning"] = f"[LLM cached] {cached.get('reasoning', '')}"
            return cached

        # ---- Build compact prompt ----
        avg_cost = self.avg_cost.get(ticker, close)
        pnl = (close - avg_cost) * held_qty if held_qty > 0 else 0.0

        style_map = {"aggressive": "aggressive momentum", "conservative": "cautious", "balanced": "balanced"}
        style = style_map.get(self._llm_style, "balanced")
        extra = f" User: {self._llm_custom_prompt}" if self._llm_custom_prompt else ""

        prompt = (
            f"{ticker} ${close:.2f} SMA20={obs.get('sma20',0):.2f} SMA50={obs.get('sma50',0):.2f} "
            f"BB=[{obs.get('bb_low',0):.2f},{obs.get('bb_up',0):.2f}] Vol={obs.get('volatility',0):.4f} "
            f"Cash=${self.cash:.0f} Shares={held_qty} AvgCost=${avg_cost:.2f} PnL=${pnl:.2f} "
            f"Style:{style}{extra} -> JSON"
        )

        llm_result = _call_ollama(self._llm_model, prompt, timeout=self._llm_timeout)
        action = llm_result["action"]
        confidence = llm_result["confidence"]
        reasoning = llm_result["reasoning"]

        # Validate action
        if action not in ("BUY", "SELL", "HOLD"):
            action = "HOLD"

        # Compute quantity based on confidence
        quantity = 0
        if action == "BUY" and close > 0:
            size_pct = self._default_size * confidence
            quantity = int((self.cash * size_pct) / close)
            if quantity <= 0:
                action = "HOLD"
                reasoning += " (insufficient cash for BUY)"
        elif action == "SELL":
            quantity = max(1, int(held_qty * confidence)) if held_qty > 0 else 0
            if quantity <= 0:
                action = "HOLD"
                reasoning += " (no position to SELL)"

        # Cache this decision
        self._llm_cached_decision = {
            "action": action,
            "ticker": ticker,
            "quantity": quantity,
            "reasoning": reasoning,
            "_confidence": confidence,
        }

        tag = f"[LLM:{self._llm_model}] "
        return {
            "action": action,
            "ticker": ticker,
            "quantity": quantity,
            "reasoning": tag + reasoning,
        }
