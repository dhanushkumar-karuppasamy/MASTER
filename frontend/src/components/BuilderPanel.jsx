import React, { useState, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import { getOllamaModels } from '../api/client';

const C = {
  green: '#4ade80', red: '#f87171', cyan: '#38bdf8',
  amber: '#fbbf24', purple: '#c084fc', muted: '#64748b',
  text: '#cbd5e1', heading: '#f1f5f9', border: 'rgba(255,255,255,0.07)',
};

const ENTRY_RULES = [
  { value: 'sma_crossover',  label: 'SMA Crossover (Golden Cross)' },
  { value: 'bb_oversold',    label: 'Bollinger Band Oversold (Price < BB Lower)' },
  { value: 'price_vs_sma',   label: 'Price Above SMA20' },
];

const EXIT_RULES = [
  { value: 'sma_death_cross',  label: 'SMA Death Cross' },
  { value: 'bb_overbought',    label: 'Bollinger Band Overbought (Price > BB Upper)' },
  { value: 'stop_loss',        label: 'Stop-Loss (-5%)' },
];

const INDICATORS = [
  { value: 'price', label: 'Price (Close)' },
  { value: 'sma20', label: 'SMA 20' },
  { value: 'sma50', label: 'SMA 50' },
  { value: 'bb_up', label: 'BB Upper' },
  { value: 'bb_low', label: 'BB Lower' },
  { value: 'bb_mid', label: 'BB Mid' },
  { value: 'volatility', label: 'Volatility' },
  { value: 'volume', label: 'Volume' },
  { value: 'held_qty', label: 'Held Quantity' },
  { value: 'cash_ratio', label: 'Cash Ratio (0–1)' },
];

const OPS = ['<', '<=', '>', '>=', '==', '!='];
const ACTIONS = ['BUY', 'SELL', 'HOLD'];
const LOGICS = ['AND', 'OR'];

function Row({ label, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
      <span style={{ minWidth: 120, fontSize: 11, color: C.muted, fontFamily: "'JetBrains Mono', monospace" }}>{label}</span>
      {children}
    </div>
  );
}

function Select({ value, onChange, options, style = {} }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        flex: 1, padding: '6px 10px',
        background: 'rgba(15,20,30,0.8)',
        border: `1px solid ${C.border}`,
        borderRadius: 5, color: C.text,
        fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
        cursor: 'pointer', ...style,
      }}
    >
      {options.map(o => (
        <option key={o.value || o} value={o.value || o}>{o.label || o}</option>
      ))}
    </select>
  );
}

function NumInput({ value, onChange, min = 0, max = 1, step = 0.01, style = {} }) {
  return (
    <input
      type="number"
      value={value}
      min={min} max={max} step={step}
      onChange={e => onChange(parseFloat(e.target.value) || 0)}
      style={{
        width: 80, padding: '6px 8px',
        background: 'rgba(15,20,30,0.8)',
        border: `1px solid ${C.border}`,
        borderRadius: 5, color: C.text,
        fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
        ...style,
      }}
    />
  );
}

function Btn({ onClick, children, color = C.cyan, disabled = false, style = {} }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '7px 16px', borderRadius: 5, cursor: disabled ? 'not-allowed' : 'pointer',
        background: disabled ? 'rgba(255,255,255,0.05)' : `${color}15`,
        border: `1px solid ${disabled ? C.border : color + '40'}`,
        color: disabled ? C.muted : color,
        fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 700,
        transition: 'all 0.15s', opacity: disabled ? 0.5 : 1, ...style,
      }}
    >
      {children}
    </button>
  );
}

const DEFAULT_BASIC = {
  entry_rule: 'sma_crossover',
  exit_rule: 'sma_death_cross',
  position_size_pct: 0.10,
  stop_loss_pct: 0.05,
};

const newCondition = () => ({ indicator: 'price', op: '<', value: 100 });
const newRule = () => ({
  id: Date.now(),
  conditions: [newCondition()],
  logic: 'AND',
  action: 'BUY',
  size_pct: 0.10,
});

const DEFAULT_CODE_TEMPLATE = `def make_decision(market_state, portfolio):
    return {
        "action": "HOLD",
        "quantity": 0,
        "reasoning": "default"
    }
`;

export default function BuilderPanel({ agentParams, setAgentParams, activeAgents, setActiveAgents, onApplyAndInit }) {
  const [mode, setMode] = useState('basic');
  const [basic, setBasic] = useState({ ...DEFAULT_BASIC });
  const [rules, setRules] = useState([newRule()]);
  const [saved, setSaved] = useState(false);
  const [goal, setGoal] = useState('');
  const [strategyName, setStrategyName] = useState('');
  const [nameError, setNameError] = useState(false);
  const [codePython, setCodePython] = useState(DEFAULT_CODE_TEMPLATE);

  // LLM mode state
  const [llmModels, setLlmModels] = useState([]);
  const [llmAvailable, setLlmAvailable] = useState(false);
  const [llmModel, setLlmModel] = useState('qwen2.5:3b');
  const [llmStyle, setLlmStyle] = useState('balanced');
  const [llmCustomPrompt, setLlmCustomPrompt] = useState('');
  const [llmLoading, setLlmLoading] = useState(false);
  const [llmCallInterval, setLlmCallInterval] = useState(3);

  // Fetch Ollama models when LLM mode is selected
  useEffect(() => {
    if (mode === 'llm') {
      setLlmLoading(true);
      getOllamaModels()
        .then(data => {
          setLlmModels(data.models || []);
          setLlmAvailable(data.available || false);
          if (data.models && data.models.length > 0 && !data.models.find(m => m.name === llmModel)) {
            setLlmModel(data.models[0].name);
          }
        })
        .catch(() => { setLlmModels([]); setLlmAvailable(false); })
        .finally(() => setLlmLoading(false));
    }
  }, [mode]);

  const buildRecipe = () => {
    const recipe = { mode };
    if (mode === 'basic') {
      recipe.basic = { ...basic };
    } else if (mode === 'code') {
      recipe.code = {
        python: codePython,
      };
    } else if (mode === 'llm') {
      recipe.llm = {
        model: llmModel,
        style: llmStyle,
        custom_prompt: llmCustomPrompt,
        call_interval: llmCallInterval,
      };
    } else {
      recipe.advanced = {
        rules: rules.map(r => ({
          conditions: r.conditions.map(c => ({
            indicator: c.indicator,
            op: c.op,
            value: parseFloat(c.value) || 0,
          })),
          logic: r.logic,
          action: r.action,
          size_pct: r.size_pct,
        })),
      };
    }
    return recipe;
  };

  const handleSave = () => {
    const trimmedName = strategyName.trim();
    if (!trimmedName) {
      setNameError(true);
      return;
    }
    setNameError(false);
    const recipe = buildRecipe();
    setAgentParams(prev => ({
      ...prev,
      custom: {
        ...(prev.custom || {}),
        recipe,
        name: trimmedName,
        goal: goal || trimmedName,
        position_size_pct: mode === 'basic' ? basic.position_size_pct : 0.10,
      },
    }));
    if (!activeAgents.includes('custom')) {
      setActiveAgents(prev => [...prev, 'custom']);
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleSaveAndInit = () => {
    const trimmedName = strategyName.trim();
    if (!trimmedName) { setNameError(true); return; }
    setNameError(false);
    const recipe = buildRecipe();
    const customParams = {
      ...(agentParams.custom || {}),
      recipe,
      name: trimmedName,
      goal: goal || trimmedName,
      position_size_pct: mode === 'basic' ? basic.position_size_pct : 0.10,
    };
    // Update state for UI consistency
    setAgentParams(prev => ({ ...prev, custom: customParams }));
    const newActiveAgents = activeAgents.includes('custom') ? activeAgents : [...activeAgents, 'custom'];
    if (!activeAgents.includes('custom')) {
      setActiveAgents(newActiveAgents);
    }
    // Call init directly with computed values (bypass stale React closure)
    onApplyAndInit({ activeAgents: newActiveAgents, customParams });
  };

  // -- Advanced: rule manipulation helpers --
  const addRule = () => setRules(prev => [...prev, newRule()]);
  const removeRule = (id) => setRules(prev => prev.filter(r => r.id !== id));
  const updateRule = (id, field, val) =>
    setRules(prev => prev.map(r => r.id === id ? { ...r, [field]: val } : r));
  const addCondition = (ruleId) =>
    setRules(prev => prev.map(r => r.id === ruleId ? { ...r, conditions: [...r.conditions, newCondition()] } : r));
  const removeCondition = (ruleId, idx) =>
    setRules(prev => prev.map(r => r.id === ruleId
      ? { ...r, conditions: r.conditions.filter((_, i) => i !== idx) }
      : r));
  const updateCondition = (ruleId, idx, field, val) =>
    setRules(prev => prev.map(r => r.id === ruleId
      ? { ...r, conditions: r.conditions.map((c, i) => i === idx ? { ...c, [field]: val } : c) }
      : r));

  const recipeJson = JSON.stringify(buildRecipe(), null, 2);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Header */}
      <div className="card" style={{ padding: '18px 20px' }}>
        <h2 style={{ margin: '0 0 6px', fontSize: 15 }}>⚙ Custom Strategy Builder</h2>
        <p style={{ fontSize: 11, color: C.muted, lineHeight: 1.6, fontFamily: "'Inter', sans-serif" }}>
          Define a rule-based trading strategy, save it as the <strong style={{ color: C.green }}>Custom</strong> agent,
          then Initialize the simulation to run it alongside the built-in agents.
          Your strategy name will appear on charts, logs, and the dynamic summary.
          Basic and Advanced modes need no coding; Code mode lets you provide a Python decision function.
        </p>
      </div>

      {/* Mode selector */}
      <div className="card" style={{ padding: '14px 20px' }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
          {['basic', 'advanced', 'code', 'llm'].map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={{
                padding: '7px 20px', borderRadius: 5, cursor: 'pointer',
                background: mode === m ? `${m === 'llm' ? C.amber : C.cyan}15` : 'rgba(255,255,255,0.03)',
                border: `1px solid ${mode === m ? (m === 'llm' ? C.amber : C.cyan) + '40' : C.border}`,
                color: mode === m ? (m === 'llm' ? C.amber : C.cyan) : C.muted,
                fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 700,
                transition: 'all 0.15s',
              }}
            >
              {m === 'llm' ? '🧠 LLM' : m === 'code' ? '💻 Code' : m.charAt(0).toUpperCase() + m.slice(1)}
            </button>
          ))}
        </div>
        <p style={{ fontSize: 10, color: C.muted, fontFamily: "'JetBrains Mono', monospace", marginTop: 6 }}>
          {mode === 'basic'
            ? 'Simple entry/exit rule selection with position size.'
            : mode === 'code'
            ? 'Write Python make_decision(market_state, portfolio) for full sandboxed strategy control.'
            : mode === 'llm'
            ? 'Local LLM (Ollama) makes autonomous trading decisions each step.'
            : 'IF-THEN rule builder: mix indicators, operators, and actions with AND/OR logic.'}
        </p>
      </div>

      {/* Basic Mode */}
      {mode === 'basic' && (
        <div className="card" style={{ padding: '18px 20px' }}>
          <h3 style={{ fontSize: 12, color: C.cyan, marginBottom: 14, fontFamily: "'JetBrains Mono', monospace", textTransform: 'uppercase', letterSpacing: 0.8 }}>
            Entry &amp; Exit Rules
          </h3>
          <Row label="Entry Rule">
            <Select value={basic.entry_rule} onChange={v => setBasic(p => ({ ...p, entry_rule: v }))} options={ENTRY_RULES} />
          </Row>
          <Row label="Exit Rule">
            <Select value={basic.exit_rule} onChange={v => setBasic(p => ({ ...p, exit_rule: v }))} options={EXIT_RULES} />
          </Row>
          {basic.exit_rule === 'stop_loss' && (
            <Row label="Stop Loss %">
              <NumInput value={basic.stop_loss_pct} onChange={v => setBasic(p => ({ ...p, stop_loss_pct: v }))} min={0.01} max={0.5} step={0.01} />
              <span style={{ fontSize: 10, color: C.muted, fontFamily: "'JetBrains Mono', monospace" }}>{(basic.stop_loss_pct * 100).toFixed(0)}%</span>
            </Row>
          )}
          <Row label="Position Size">
            <input
              type="range" min={0.01} max={0.5} step={0.01}
              value={basic.position_size_pct}
              onChange={e => setBasic(p => ({ ...p, position_size_pct: parseFloat(e.target.value) }))}
              style={{ flex: 1, accentColor: C.cyan }}
            />
            <span style={{ fontSize: 11, color: C.cyan, fontFamily: "'JetBrains Mono', monospace", minWidth: 36 }}>
              {(basic.position_size_pct * 100).toFixed(0)}%
            </span>
          </Row>
        </div>
      )}

      {/* Advanced Mode */}
      {mode === 'advanced' && (
        <div className="card" style={{ padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h3 style={{ fontSize: 12, color: C.purple, margin: 0, fontFamily: "'JetBrains Mono', monospace", textTransform: 'uppercase', letterSpacing: 0.8 }}>
              IF-THEN Rules
            </h3>
            <Btn onClick={addRule} color={C.purple}>+ Add Rule</Btn>
          </div>

          {rules.map((rule, ruleIdx) => (
            <div key={rule.id} style={{
              padding: '14px 16px', borderRadius: 8, marginBottom: 12,
              background: 'rgba(192,132,252,0.04)', border: '1px solid rgba(192,132,252,0.15)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: C.purple, fontFamily: "'JetBrains Mono', monospace" }}>
                  Rule {ruleIdx + 1}
                </span>
                {rules.length > 1 && (
                  <Btn onClick={() => removeRule(rule.id)} color={C.red} style={{ padding: '3px 10px', fontSize: 10 }}>✕ Remove</Btn>
                )}
              </div>

              {/* Conditions */}
              {rule.conditions.map((cond, cIdx) => (
                <div key={cIdx} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                  {cIdx === 0
                    ? <span style={{ width: 28, fontSize: 10, color: C.muted, fontFamily: "'JetBrains Mono', monospace", textAlign: 'center' }}>IF</span>
                    : (
                      <select
                        value={rule.logic}
                        onChange={e => updateRule(rule.id, 'logic', e.target.value)}
                        style={{
                          width: 52, padding: '5px 4px', background: 'rgba(15,20,30,0.8)',
                          border: `1px solid ${C.border}`, borderRadius: 4, color: C.cyan,
                          fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 700,
                        }}
                      >
                        {LOGICS.map(l => <option key={l} value={l}>{l}</option>)}
                      </select>
                    )
                  }
                  <select value={cond.indicator} onChange={e => updateCondition(rule.id, cIdx, 'indicator', e.target.value)}
                    style={{ flex: 2, padding: '5px 8px', background: 'rgba(15,20,30,0.8)', border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, fontFamily: "'JetBrains Mono', monospace", fontSize: 10, cursor: 'pointer' }}>
                    {INDICATORS.map(i => <option key={i.value} value={i.value}>{i.label}</option>)}
                  </select>
                  <select value={cond.op} onChange={e => updateCondition(rule.id, cIdx, 'op', e.target.value)}
                    style={{ width: 52, padding: '5px 4px', background: 'rgba(15,20,30,0.8)', border: `1px solid ${C.border}`, borderRadius: 4, color: C.amber, fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                    {OPS.map(op => <option key={op} value={op}>{op}</option>)}
                  </select>
                  <input type="number" value={cond.value}
                    onChange={e => updateCondition(rule.id, cIdx, 'value', e.target.value)}
                    style={{ width: 72, padding: '5px 7px', background: 'rgba(15,20,30,0.8)', border: `1px solid ${C.border}`, borderRadius: 4, color: C.green, fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}
                  />
                  {rule.conditions.length > 1 && (
                    <button onClick={() => removeCondition(rule.id, cIdx)}
                      style={{ background: 'none', border: 'none', color: C.red, cursor: 'pointer', fontSize: 13, padding: '2px 4px' }}>✕</button>
                  )}
                </div>
              ))}
              <Btn onClick={() => addCondition(rule.id)} color={C.muted} style={{ fontSize: 9, padding: '3px 10px', marginBottom: 10 }}>
                + condition
              </Btn>

              {/* Action row */}
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 4 }}>
                <span style={{ fontSize: 10, color: C.muted, fontFamily: "'JetBrains Mono', monospace", minWidth: 28 }}>THEN</span>
                <Select value={rule.action} onChange={v => updateRule(rule.id, 'action', v)}
                  options={ACTIONS.map(a => ({ value: a, label: a }))} style={{ flex: 1 }} />
                <span style={{ fontSize: 10, color: C.muted, fontFamily: "'JetBrains Mono', monospace" }}>Size:</span>
                <NumInput value={rule.size_pct} onChange={v => updateRule(rule.id, 'size_pct', v)} min={0.01} max={1} step={0.01} style={{ width: 68 }} />
                <span style={{ fontSize: 10, color: C.muted, fontFamily: "'JetBrains Mono', monospace" }}>
                  {(rule.size_pct * 100).toFixed(0)}%
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Code Mode */}
      {mode === 'code' && (
        <div className="card" style={{ padding: '18px 20px' }}>
          <h3 style={{ fontSize: 12, color: C.green, marginBottom: 14, fontFamily: "'JetBrains Mono', monospace", textTransform: 'uppercase', letterSpacing: 0.8 }}>
            Python Sandbox
          </h3>
          <p style={{ fontSize: 10, color: C.muted, fontFamily: "'JetBrains Mono', monospace", marginBottom: 10, lineHeight: 1.5 }}>
            Implement <code style={{ color: C.cyan }}>make_decision(market_state, portfolio)</code> and return
            {' '}<code style={{ color: C.amber }}>{'{"action":"BUY|SELL|HOLD","quantity":number,"reasoning":"text"}'}</code>.
          </p>
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
            <Editor
              height="320px"
              defaultLanguage="python"
              theme="vs-dark"
              value={codePython}
              onChange={v => setCodePython(v || DEFAULT_CODE_TEMPLATE)}
              options={{
                minimap: { enabled: false },
                fontSize: 12,
                fontFamily: "'JetBrains Mono', monospace",
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                automaticLayout: true,
              }}
            />
          </div>
        </div>
      )}

      {/* LLM Mode */}
      {mode === 'llm' && (
        <div className="card" style={{ padding: '18px 20px' }}>
          <h3 style={{ fontSize: 12, color: C.amber, marginBottom: 14, fontFamily: "'JetBrains Mono', monospace", textTransform: 'uppercase', letterSpacing: 0.8, display: 'flex', alignItems: 'center', gap: 8 }}>
            🧠 Local LLM Agent (Ollama)
          </h3>

          {llmLoading ? (
            <p style={{ fontSize: 11, color: C.muted, fontFamily: "'JetBrains Mono', monospace" }}>Connecting to Ollama...</p>
          ) : !llmAvailable ? (
            <div style={{ padding: '12px 14px', borderRadius: 6, background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)' }}>
              <p style={{ fontSize: 11, color: C.red, fontFamily: "'JetBrains Mono', monospace", margin: 0 }}>
                ✕ Ollama is not running. Start it with: <code style={{ color: C.amber }}>ollama serve</code>
              </p>
            </div>
          ) : (
            <>
              <Row label="Model">
                <select
                  value={llmModel}
                  onChange={e => setLlmModel(e.target.value)}
                  style={{
                    flex: 1, padding: '6px 10px',
                    background: 'rgba(15,20,30,0.8)',
                    border: `1px solid ${C.border}`,
                    borderRadius: 5, color: C.text,
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
                    cursor: 'pointer',
                  }}
                >
                  {llmModels.map(m => (
                    <option key={m.name} value={m.name}>
                      {m.name} ({m.parameters}, {m.size_gb} GB)
                    </option>
                  ))}
                </select>
              </Row>

              <Row label="Trading Style">
                <div style={{ display: 'flex', gap: 6, flex: 1 }}>
                  {['conservative', 'balanced', 'aggressive'].map(s => (
                    <button
                      key={s}
                      onClick={() => setLlmStyle(s)}
                      style={{
                        flex: 1, padding: '6px 12px', borderRadius: 5, cursor: 'pointer',
                        background: llmStyle === s ? `${s === 'aggressive' ? C.red : s === 'conservative' ? C.green : C.amber}15` : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${llmStyle === s ? (s === 'aggressive' ? C.red : s === 'conservative' ? C.green : C.amber) + '40' : C.border}`,
                        color: llmStyle === s ? (s === 'aggressive' ? C.red : s === 'conservative' ? C.green : C.amber) : C.muted,
                        fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 700,
                        transition: 'all 0.15s', textTransform: 'capitalize',
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </Row>

              <Row label="Instructions">
                <textarea
                  placeholder="Optional: e.g. 'Only buy tech stocks on dips' or 'Never hold more than 50% in stock'"
                  value={llmCustomPrompt}
                  onChange={e => setLlmCustomPrompt(e.target.value)}
                  rows={3}
                  style={{
                    flex: 1, padding: '7px 10px',
                    background: 'rgba(15,20,30,0.8)',
                    border: `1px solid ${C.border}`,
                    borderRadius: 5, color: C.text,
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
                    resize: 'vertical',
                  }}
                />
              </Row>

              <Row label="LLM Frequency">
                <input
                  type="range" min={1} max={10} step={1}
                  value={llmCallInterval}
                  onChange={e => setLlmCallInterval(parseInt(e.target.value))}
                  style={{ flex: 1, accentColor: C.amber }}
                />
                <span style={{ fontSize: 11, color: C.amber, fontFamily: "'JetBrains Mono', monospace", minWidth: 80 }}>
                  every {llmCallInterval} step{llmCallInterval > 1 ? 's' : ''}
                </span>
              </Row>

              <div style={{
                marginTop: 8, padding: '10px 14px', borderRadius: 6,
                background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.15)',
              }}>
                <p style={{ fontSize: 10, color: C.amber, fontFamily: "'JetBrains Mono', monospace", margin: 0, lineHeight: 1.6 }}>
                  ⚡ The LLM is queried every {llmCallInterval} step{llmCallInterval > 1 ? 's' : ''} (cached in between for speed).
                  Model is pre-loaded into GPU on init. Use 3B for fast responses.
                </p>
              </div>
            </>
          )}
        </div>
      )}

      {/* Strategy Name – mandatory */}
      <div className="card" style={{ padding: '14px 20px' }}>
        <Row label="Strategy Name *">
          <input
            type="text"
            placeholder="e.g. My Alpha Bot"
            value={strategyName}
            onChange={e => { setStrategyName(e.target.value); if (e.target.value.trim()) setNameError(false); }}
            style={{
              flex: 1, padding: '7px 10px',
              background: 'rgba(15,20,30,0.8)',
              border: `1px solid ${nameError ? C.red + '80' : strategyName.trim() ? C.green + '60' : C.border}`,
              borderRadius: 5, color: C.text,
              fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
              outline: 'none',
            }}
          />
        </Row>
        {nameError && (
          <p style={{ fontSize: 10, color: C.red, marginTop: 4, fontFamily: "'JetBrains Mono', monospace" }}>
            ✕ Strategy name is required before saving.
          </p>
        )}
        <Row label="Goal / Notes">
          <input
            type="text"
            placeholder="e.g. Buy oversold breakouts (optional)"
            value={goal}
            onChange={e => setGoal(e.target.value)}
            style={{
              flex: 1, padding: '7px 10px',
              background: 'rgba(15,20,30,0.8)',
              border: `1px solid ${C.border}`,
              borderRadius: 5, color: C.text,
              fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
            }}
          />
        </Row>
      </div>

      {/* Recipe preview + save */}
      <div className="card" style={{ padding: '14px 20px' }}>
        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          <Btn onClick={handleSave} color={C.green} style={{ flex: 1 }}>
            {saved ? '\u2713 Saved! Enable Custom agent & re-init.' : '\ud83d\udcbe Save Strategy'}
          </Btn>
          <Btn onClick={handleSaveAndInit} color={C.cyan} style={{ flex: 1 }}>
            \u25b6 Save &amp; Initialize Now
          </Btn>
        </div>

        <details style={{ marginTop: 4 }}>
          <summary style={{ fontSize: 10, color: C.muted, cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace", userSelect: 'none' }}>
            View JSON recipe ▸
          </summary>
          <pre style={{
            marginTop: 8, padding: '12px 14px', borderRadius: 6,
            background: 'rgba(0,0,0,0.3)', border: `1px solid ${C.border}`,
            fontSize: 10, color: C.green, fontFamily: "'JetBrains Mono', monospace",
            overflowX: 'auto', lineHeight: 1.6, maxHeight: 300, overflowY: 'auto',
          }}>
            {recipeJson}
          </pre>
        </details>
      </div>
    </div>
  );
}
