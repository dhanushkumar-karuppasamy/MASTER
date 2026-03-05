import React from 'react';

/* ── palette ── */
const C = {
  green: '#4ade80', red: '#f87171', cyan: '#38bdf8',
  amber: '#fbbf24', purple: '#c084fc', muted: '#64748b',
  text: '#cbd5e1', heading: '#f1f5f9',
  border: 'rgba(255,255,255,0.07)',
};

const AGENT_META = {
  Conservative: { icon: '🛡', accent: C.cyan,   strategy: 'Low-volatility, stop-loss protected', style: 'Defensive' },
  Momentum:     { icon: '🚀', accent: C.green,  strategy: 'Trend-following via SMA crossover', style: 'Aggressive' },
  MeanReversion:{ icon: '↩',  accent: C.purple, strategy: 'Bollinger Band mean-revert', style: 'Contrarian' },
  NoiseTrader:  { icon: '🎲', accent: C.amber,  strategy: 'Random trades for market noise', style: 'Random' },
  Adversarial:  { icon: '🦈', accent: C.red,    strategy: 'Pump-and-dump manipulation', style: 'Manipulative' },
};

function fmt(val, d = 2) {
  if (val == null || Number.isNaN(Number(val))) return '—';
  return Number(val).toFixed(d);
}

function riskColor(val) {
  if (val == null) return C.muted;
  if (val >= 0) return C.green;
  if (val > -5) return C.amber;
  return C.red;
}

/* ── Mini spark bar chart for portfolio history ── */
function SparkBar({ values, color, height = 28 }) {
  if (!values?.length) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const barW = Math.max(1, Math.min(4, 120 / values.length));
  return (
    <svg width="100%" height={height} viewBox={`0 0 ${values.length * (barW + 1)} ${height}`} style={{ display: 'block' }}>
      {values.map((v, i) => {
        const h = ((v - min) / range) * (height - 2) + 2;
        return <rect key={i} x={i * (barW + 1)} y={height - h} width={barW} height={h} rx={1} fill={color} opacity={0.5 + 0.5 * (i / values.length)} />;
      })}
    </svg>
  );
}

/* ── Progress ring ── */
function ProgressRing({ pct, color, size = 44, stroke = 3 }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const clampedPct = Math.max(0, Math.min(100, Math.abs(pct)));
  const offset = circ - (clampedPct / 100) * circ;
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.4s ease' }} />
    </svg>
  );
}

export default function AgentsPanel({ agents, tradeLog, headAgent, systemRisk, regulationLog }) {
  const [expandedAgent, setExpandedAgent] = React.useState(null);
  const [expandedSection, setExpandedSection] = React.useState({}); // { agentName: 'trades' | 'pipeline' | null }

  const agentTrades = React.useMemo(() => {
    if (!tradeLog?.length) return {};
    const map = {};
    for (const t of tradeLog) {
      if (t.action !== 'BUY' && t.action !== 'SELL') continue;
      if (!map[t.agent_name]) map[t.agent_name] = [];
      map[t.agent_name].push(t);
    }
    return map;
  }, [tradeLog]);

  // Build portfolio value history per agent from tradeLog
  const agentPortfolioHistory = React.useMemo(() => {
    if (!tradeLog?.length) return {};
    const map = {};
    for (const t of tradeLog) {
      if (!t.portfolio_value) continue;
      if (!map[t.agent_name]) map[t.agent_name] = [];
      map[t.agent_name].push(t.portfolio_value);
    }
    return map;
  }, [tradeLog]);

  if (!agents || agents.length === 0) {
    return (
      <div className="card" style={{ padding: '20px 18px' }}>
        <h2>⬡ AI Trading Agents</h2>
        <p style={{ color: C.muted, fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>
          Initialize a simulation to see the agents in action.
        </p>
      </div>
    );
  }

  // Calculate initial portfolio for allocation bars
  const INITIAL_CASH = 100000;

  const toggleSection = (agentName, section) => {
    setExpandedSection(prev => ({
      ...prev,
      [agentName]: prev[agentName] === section ? null : section,
    }));
  };

  return (
    <>
      {/* ── Agent Summary Bar ── */}
      <div className="card" style={{ padding: '14px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>⬡ AI Trading Agents</h2>
          <span style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: C.muted,
            padding: '3px 10px', borderRadius: 4, background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.06)',
          }}>
            {agents.length} agents · {Object.values(agentTrades).flat().length} total trades
          </span>
        </div>

        {/* Quick overview row */}
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
          {agents.map(agent => {
            const meta = AGENT_META[agent.name] || { icon: '◈', accent: C.cyan, strategy: '', style: '' };
            const ret = agent.return_pct ?? 0;
            const isPos = ret >= 0;
            const isActive = expandedAgent === agent.name;
            return (
              <button
                key={agent.name}
                onClick={() => setExpandedAgent(isActive ? null : agent.name)}
                style={{
                  flex: '0 0 auto', minWidth: 110,
                  padding: '8px 12px', borderRadius: 8, cursor: 'pointer',
                  background: isActive ? `${meta.accent}11` : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${isActive ? `${meta.accent}44` : 'rgba(255,255,255,0.06)'}`,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                  transition: 'all 0.2s ease',
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                <span style={{ fontSize: 20 }}>{meta.icon}</span>
                <span style={{ fontSize: 10, fontWeight: 600, color: isActive ? meta.accent : C.text }}>{agent.name}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: isPos ? C.green : C.red }}>
                  {isPos ? '+' : ''}{fmt(ret, 1)}%
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Individual Agent Cards ── */}
      {/* ── Orchestrator (Head Agent) Card ── */}
      {headAgent && (
        <div className="card" style={{ padding: '16px 18px', borderLeft: `3px solid ${C.cyan}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 10,
              background: `${C.cyan}15`, border: `1px solid ${C.cyan}33`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0,
            }}>🧠</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.heading, fontFamily: "'Inter', system-ui, sans-serif" }}>
                OrchestratorAgent
              </div>
              <div style={{ fontSize: 10, color: C.muted, fontFamily: "'JetBrains Mono', monospace", marginTop: 2 }}>
                Head Agent · coordinates all trading agents and the market
              </div>
            </div>
            <span style={{
              padding: '2px 10px', borderRadius: 4, fontSize: 9, fontWeight: 700,
              background: `${C.cyan}15`, color: C.cyan, border: `1px solid ${C.cyan}33`,
              fontFamily: "'JetBrains Mono', monospace",
            }}>ACTIVE</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 10 }}>
            {[
              { label: 'Step', value: headAgent.current_step ?? '—', color: C.cyan },
              { label: 'Max Steps', value: headAgent.max_steps ?? '—', color: C.text },
              { label: 'Run ID', value: headAgent.run_id ? headAgent.run_id.slice(0, 8) + '…' : '—', color: C.muted },
              { label: 'Circuit Breakers', value: headAgent.circuit_breakers_active ?? 0, color: (headAgent.circuit_breakers_active ?? 0) > 0 ? C.red : C.green },
              { label: 'Crash Active', value: headAgent.crash_active ? 'YES' : 'NO', color: headAgent.crash_active ? C.red : C.green },
              { label: 'Trading', value: headAgent.trading_halted ? 'HALTED' : 'ACTIVE', color: headAgent.trading_halted ? C.red : C.green },
            ].map(m => (
              <div key={m.label} style={{
                padding: '8px 10px', borderRadius: 6, textAlign: 'center',
                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
              }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: m.color, fontFamily: "'JetBrains Mono', monospace" }}>{m.value}</div>
                <div style={{ fontSize: 8, color: C.muted, marginTop: 2, fontFamily: "'JetBrains Mono', monospace", textTransform: 'uppercase', letterSpacing: 0.4 }}>{m.label}</div>
              </div>
            ))}
          </div>
          {/* System Risk row */}
          {systemRisk && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[
                { label: 'Total AUM', value: `₹${Math.round(systemRisk.total_aum ?? 0).toLocaleString()}`, color: C.text },
                { label: 'Exposure', value: `${fmt(systemRisk.exposure_pct, 1)}%`, color: C.amber },
                { label: 'Global DD', value: `${fmt(systemRisk.global_drawdown_pct, 2)}%`, color: (systemRisk.global_drawdown_pct ?? 0) < -5 ? C.red : C.green },
                { label: 'Active Agents', value: systemRisk.active_agents ?? '—', color: C.cyan },
                { label: 'Violations', value: systemRisk.violation_count ?? 0, color: (systemRisk.violation_count ?? 0) > 0 ? C.amber : C.green },
              ].map(m => (
                <div key={m.label} style={{
                  flex: '1 1 0', minWidth: 70, padding: '6px 8px', borderRadius: 6, textAlign: 'center',
                  background: `${m.color}08`, border: `1px solid ${m.color}22`,
                }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: m.color, fontFamily: "'JetBrains Mono', monospace" }}>{m.value}</div>
                  <div style={{ fontSize: 8, color: C.muted, marginTop: 1, fontFamily: "'JetBrains Mono', monospace", textTransform: 'uppercase', letterSpacing: 0.4 }}>{m.label}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Regulator (Compliance Agent) Card ── */}
      {regulationLog !== undefined && (
        <div className="card" style={{ padding: '16px 18px', borderLeft: `3px solid ${C.amber}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 10,
              background: `${C.amber}15`, border: `1px solid ${C.amber}33`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0,
            }}>⚖</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.heading, fontFamily: "'Inter', system-ui, sans-serif" }}>
                RegulatorAgent
              </div>
              <div style={{ fontSize: 10, color: C.muted, fontFamily: "'JetBrains Mono', monospace", marginTop: 2 }}>
                Compliance Agent · MaxPosition · BurstTrading · ManipulationPattern
              </div>
            </div>
            <span style={{
              padding: '2px 10px', borderRadius: 4, fontSize: 9, fontWeight: 700,
              background: `${C.amber}15`, color: C.amber, border: `1px solid ${C.amber}33`,
              fontFamily: "'JetBrains Mono', monospace",
            }}>ACTIVE</span>
          </div>
          {/* Violation summary */}
          {(() => {
            const log = regulationLog || [];
            const total = log.length;
            const warns = log.filter(e => e.decision === 'WARN').length;
            const blocks = log.filter(e => e.decision === 'BLOCK').length;
            // per-agent breakdown
            const byAgent = {};
            for (const e of log) {
              const n = e.agent_name || 'SYSTEM';
              if (!byAgent[n]) byAgent[n] = { warns: 0, blocks: 0 };
              if (e.decision === 'WARN') byAgent[n].warns++;
              if (e.decision === 'BLOCK') byAgent[n].blocks++;
            }
            return (
              <>
                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  {[
                    { label: 'Total Events', value: total, color: C.text },
                    { label: 'Warnings', value: warns, color: C.amber },
                    { label: 'Blocks', value: blocks, color: C.red },
                  ].map(m => (
                    <div key={m.label} style={{
                      flex: 1, padding: '8px 10px', borderRadius: 6, textAlign: 'center',
                      background: `${m.color}08`, border: `1px solid ${m.color}22`,
                    }}>
                      <div style={{ fontSize: 18, fontWeight: 700, color: m.color, fontFamily: "'JetBrains Mono', monospace" }}>{m.value}</div>
                      <div style={{ fontSize: 8, color: C.muted, marginTop: 2, fontFamily: "'JetBrains Mono', monospace", textTransform: 'uppercase', letterSpacing: 0.4 }}>{m.label}</div>
                    </div>
                  ))}
                </div>
                {Object.keys(byAgent).length > 0 && (
                  <div style={{ borderRadius: 6, border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                    <div style={{ padding: '6px 10px', background: 'rgba(255,255,255,0.03)', fontSize: 9, color: C.muted, fontFamily: "'JetBrains Mono', monospace", textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      Per-Agent Violations
                    </div>
                    {Object.entries(byAgent).map(([name, counts]) => (
                      <div key={name} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '6px 10px', borderTop: '1px solid rgba(255,255,255,0.04)',
                        fontSize: 10, fontFamily: "'JetBrains Mono', monospace",
                      }}>
                        <span style={{ color: C.text }}>{name}</span>
                        <span style={{ display: 'flex', gap: 8 }}>
                          <span style={{ color: C.amber }}>⚠ {counts.warns}</span>
                          <span style={{ color: C.red }}>⊘ {counts.blocks}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {total === 0 && (
                  <div style={{ textAlign: 'center', color: C.muted, fontSize: 11, fontFamily: "'JetBrains Mono', monospace", padding: '8px 0' }}>
                    No violations recorded yet.
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}

      {/* ── Trading Agent Cards ── */}
      {agents.map(agent => {
        const meta = AGENT_META[agent.name] || { icon: '◈', accent: C.cyan, strategy: '', style: '' };
        const trades = agentTrades[agent.name] || [];
        const portfolioHist = agentPortfolioHistory[agent.name] || [];
        const buys = trades.filter(t => t.action === 'BUY').length;
        const sells = trades.filter(t => t.action === 'SELL').length;
        const blocked = trades.filter(t => t.regulator_decision === 'BLOCK').length;
        const pos = agent.positions || {};
        const posStr = Object.entries(pos).map(([t, q]) => `${t}: ${q}`).join(', ') || 'None';
        const ret = agent.return_pct ?? 0;
        const isPos = ret >= 0;
        const isHalted = agent.halted;
        const isInactive = !agent.active;
        const mem = agent.latest_memory || null;
        const perf = agent.performance_stats || {};
        const memAction = mem?.action || {};
        const memDecision = mem?.decision || {};
        const memResult = mem?.result || null;
        const openSection = expandedSection[agent.name] || null;
        const allocationPct = agent.portfolio_value ? (agent.portfolio_value / INITIAL_CASH) * 100 : 100;
        const followers = agent.followers ?? 1;

        return (
          <div key={agent.name} className="card" style={{
            padding: '16px 18px',
            borderLeft: `3px solid ${meta.accent}`,
            opacity: isInactive ? 0.5 : 1,
          }}>
            {/* ── Header ── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 10,
                background: `${meta.accent}15`, border: `1px solid ${meta.accent}33`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 22, flexShrink: 0,
              }}>
                {meta.icon}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: C.heading, fontFamily: "'Inter', system-ui, sans-serif" }}>
                    {agent.name}
                  </span>
                  {isHalted && (
                    <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 9, fontWeight: 700,
                      background: 'rgba(255,59,92,0.15)', color: C.red, border: '1px solid rgba(255,59,92,0.3)',
                      fontFamily: "'JetBrains Mono', monospace" }}>HALTED</span>
                  )}
                  {isInactive && (
                    <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 9, fontWeight: 700,
                      background: 'rgba(90,100,120,0.15)', color: C.muted, border: '1px solid rgba(255,255,255,0.1)',
                      fontFamily: "'JetBrains Mono', monospace" }}>INACTIVE</span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                  <span style={{ fontSize: 10, color: C.muted, fontFamily: "'JetBrains Mono', monospace" }}>
                    {meta.strategy}
                  </span>
                  {followers > 1 && (
                    <span style={{
                      fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 3,
                      background: `${meta.accent}18`, color: meta.accent, border: `1px solid ${meta.accent}33`,
                      fontFamily: "'JetBrains Mono', monospace",
                    }}>×{followers} followers</span>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: isPos ? C.green : C.red, fontFamily: "'JetBrains Mono', monospace" }}>
                  {isPos ? '+' : ''}{fmt(ret, 2)}%
                </span>
                <span style={{
                  fontSize: 9, padding: '1px 6px', borderRadius: 3,
                  background: `${meta.accent}15`, color: meta.accent,
                  fontFamily: "'JetBrains Mono', monospace", fontWeight: 600,
                }}>{meta.style}</span>
              </div>
            </div>

            {/* ── Portfolio + Holdings row ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              {/* Portfolio Value */}
              <div style={{
                padding: '10px 12px', borderRadius: 8,
                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
              }}>
                <div style={{ fontSize: 9, color: C.muted, marginBottom: 4, fontFamily: "'JetBrains Mono', monospace", textTransform: 'uppercase', letterSpacing: 0.5 }}>Portfolio</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: C.heading, fontFamily: "'JetBrains Mono', monospace" }}>
                  ₹{Math.round(agent.portfolio_value || 0).toLocaleString()}
                </div>
                {/* Portfolio bar */}
                <div style={{ marginTop: 6, height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.06)' }}>
                  <div style={{
                    height: '100%', borderRadius: 2,
                    width: `${Math.min(allocationPct, 150)}%`,
                    background: isPos ? C.green : C.red,
                    transition: 'width 0.3s ease',
                    opacity: 0.6,
                  }} />
                </div>
              </div>

              {/* Cash + Holdings */}
              <div style={{
                padding: '10px 12px', borderRadius: 8,
                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
              }}>
                <div>
                  <div style={{ fontSize: 9, color: C.muted, marginBottom: 2, fontFamily: "'JetBrains Mono', monospace", textTransform: 'uppercase', letterSpacing: 0.5 }}>Cash</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.text, fontFamily: "'JetBrains Mono', monospace" }}>
                    ₹{Math.round(agent.cash || 0).toLocaleString()}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 9, color: C.muted, fontFamily: "'JetBrains Mono', monospace", textTransform: 'uppercase', letterSpacing: 0.5 }}>Holdings</div>
                  <div style={{ fontSize: 11, color: C.text, fontFamily: "'JetBrains Mono', monospace" }}>{posStr}</div>
                </div>
              </div>
            </div>

            {/* ── Risk Metrics as colored chips ── */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
              {[
                { label: 'Return', value: agent.return_pct, suffix: '%', color: riskColor(agent.return_pct) },
                { label: 'Drawdown', value: agent.current_drawdown_pct, suffix: '%', color: riskColor(agent.current_drawdown_pct) },
                { label: 'Max DD', value: agent.max_drawdown_pct, suffix: '%', color: riskColor(agent.max_drawdown_pct) },
                { label: 'Sharpe', value: agent.sharpe_ratio, suffix: '', color: (agent.sharpe_ratio ?? 0) >= 0 ? C.green : C.red },
              ].map(m => (
                <div key={m.label} style={{
                  flex: '1 1 0', minWidth: 70,
                  padding: '6px 8px', borderRadius: 6, textAlign: 'center',
                  background: `${m.color}08`, border: `1px solid ${m.color}22`,
                }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: m.color, fontFamily: "'JetBrains Mono', monospace" }}>
                    {m.value != null ? `${fmt(m.value, 1)}${m.suffix}` : '—'}
                  </div>
                  <div style={{ fontSize: 8, color: C.muted, marginTop: 1, fontFamily: "'JetBrains Mono', monospace", textTransform: 'uppercase', letterSpacing: 0.4 }}>{m.label}</div>
                </div>
              ))}
            </div>

            {/* ── Portfolio Spark + Last Action ── */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
              {portfolioHist.length > 1 && (
                <div style={{
                  flex: 1, padding: '8px 10px', borderRadius: 6,
                  background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
                }}>
                  <div style={{ fontSize: 9, color: C.muted, marginBottom: 4, fontFamily: "'JetBrains Mono', monospace", textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Portfolio Trend
                  </div>
                  <SparkBar values={portfolioHist} color={meta.accent} height={24} />
                </div>
              )}
              <div style={{
                flex: portfolioHist.length > 1 ? '0 0 120px' : 1,
                padding: '8px 10px', borderRadius: 6,
                background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
                display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
              }}>
                <div style={{ fontSize: 9, color: C.muted, marginBottom: 4, fontFamily: "'JetBrains Mono', monospace", textTransform: 'uppercase' }}>Last Action</div>
                {(() => {
                  const a = agent.last_action || 'HOLD';
                  const isBuy = a === 'BUY';
                  const isSell = a === 'SELL';
                  const color = isBuy ? C.green : isSell ? C.red : C.muted;
                  return (
                    <span style={{
                      padding: '3px 10px', borderRadius: 4, fontSize: 11, fontWeight: 700,
                      background: `${color}15`, color, border: `1px solid ${color}33`,
                      fontFamily: "'JetBrains Mono', monospace",
                    }}>
                      {isBuy ? '▲ ' : isSell ? '▼ ' : ''}{a}
                    </span>
                  );
                })()}
              </div>
            </div>

            {/* ── Followers + Last Action stat row ── */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
              <div style={{
                padding: '4px 10px', borderRadius: 4, fontSize: 10, fontWeight: 600,
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                color: C.muted, fontFamily: "'JetBrains Mono', monospace",
                display: 'flex', alignItems: 'center', gap: 4,
              }}>
                <span style={{ color: meta.accent }}>◈</span>
                Followers: <span style={{ color: followers > 1 ? meta.accent : C.text }}>{followers}</span>
              </div>
              <div style={{
                padding: '4px 10px', borderRadius: 4, fontSize: 10,
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                color: C.muted, fontFamily: "'JetBrains Mono', monospace",
                display: 'flex', alignItems: 'center', gap: 4,
              }}>
                W/L: <span style={{ color: C.green }}>{perf.wins ?? 0}</span>/<span style={{ color: C.red }}>{perf.losses ?? 0}</span>
              </div>
            </div>

            {/* ── Last Reason (collapsible accordion) ── */}
            {agent.last_reason && (
              <div style={{ marginBottom: 10 }}>
                <button
                  onClick={() => toggleSection(agent.name, 'reasoning')}
                  style={{
                    width: '100%', padding: '6px 10px', borderRadius: 6,
                    background: openSection === 'reasoning' ? 'rgba(168,85,247,0.08)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${openSection === 'reasoning' ? 'rgba(168,85,247,0.2)' : 'rgba(255,255,255,0.08)'}`,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
                    color: openSection === 'reasoning' ? C.purple : C.muted, transition: 'all 0.15s',
                  }}
                >
                  <span>💭 Last Reasoning</span>
                  <span style={{ fontSize: 8 }}>{openSection === 'reasoning' ? '▾' : '▸'}</span>
                </button>
                {openSection === 'reasoning' && (
                  <div style={{
                    padding: '8px 10px', borderRadius: '0 0 6px 6px',
                    background: 'rgba(168,85,247,0.04)', border: '1px solid rgba(168,85,247,0.1)',
                    borderTop: 'none',
                    fontSize: 10, color: C.text, fontStyle: 'italic', lineHeight: 1.7,
                    fontFamily: "'JetBrains Mono', monospace",
                  }}>
                    {agent.last_reason}
                  </div>
                )}
              </div>
            )}

            {/* ── Expandable Sections ── */}
            <div style={{ display: 'flex', gap: 6 }}>
              {/* Trade History Toggle */}
              <button
                onClick={() => toggleSection(agent.name, 'trades')}
                style={{
                  flex: 1, padding: '6px 10px',
                  background: openSection === 'trades' ? 'rgba(0,212,255,0.08)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${openSection === 'trades' ? 'rgba(0,212,255,0.2)' : 'rgba(255,255,255,0.08)'}`,
                  borderRadius: 6, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
                  color: openSection === 'trades' ? C.cyan : C.muted,
                  transition: 'all 0.15s',
                }}
              >
                <span>⇅ Trade History</span>
                <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ color: C.green, fontWeight: 600 }}>▲{buys}</span>
                  <span style={{ color: C.red, fontWeight: 600 }}>▼{sells}</span>
                  {blocked > 0 && <span style={{ color: C.amber, fontWeight: 600 }}>⊘{blocked}</span>}
                  <span style={{ fontSize: 8 }}>{openSection === 'trades' ? '▾' : '▸'}</span>
                </span>
              </button>

              {/* AI Pipeline Toggle */}
              <button
                onClick={() => toggleSection(agent.name, 'pipeline')}
                style={{
                  flex: 1, padding: '6px 10px',
                  background: openSection === 'pipeline' ? 'rgba(168,85,247,0.08)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${openSection === 'pipeline' ? 'rgba(168,85,247,0.2)' : 'rgba(255,255,255,0.08)'}`,
                  borderRadius: 6, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
                  color: openSection === 'pipeline' ? C.purple : C.muted,
                  transition: 'all 0.15s',
                }}
              >
                <span>◈ AI Pipeline</span>
                <span style={{ fontSize: 8 }}>{openSection === 'pipeline' ? '▾' : '▸'}</span>
              </button>
            </div>

            {/* ── Trade History Expanded ── */}
            {openSection === 'trades' && (
              <div style={{
                marginTop: 8, maxHeight: 200, overflowY: 'auto',
                borderRadius: 6, border: '1px solid rgba(255,255,255,0.06)',
                background: 'rgba(0,0,0,0.15)',
              }}>
                {trades.length === 0 ? (
                  <div style={{ padding: 16, color: C.muted, fontSize: 11, textAlign: 'center',
                    fontFamily: "'JetBrains Mono', monospace" }}>
                    No trades executed yet. Run some steps first.
                  </div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10,
                    fontFamily: "'JetBrains Mono', monospace" }}>
                    <thead>
                      <tr style={{ color: C.muted, borderBottom: '1px solid rgba(255,255,255,0.06)', position: 'sticky', top: 0, background: 'rgba(14,17,28,0.95)' }}>
                        <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 500 }}>Step</th>
                        <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 500 }}>Side</th>
                        <th style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 500 }}>Qty</th>
                        <th style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 500 }}>Price</th>
                        <th style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 500 }}>Value</th>
                        <th style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 500 }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trades.map((t, idx) => {
                        const isBuy = t.action === 'BUY';
                        const isBlocked = t.regulator_decision === 'BLOCK';
                        return (
                          <tr key={idx} style={{
                            borderBottom: '1px solid rgba(255,255,255,0.03)',
                            opacity: isBlocked ? 0.5 : 1,
                            transition: 'background 0.1s',
                          }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                          >
                            <td style={{ padding: '5px 8px', color: C.muted }}>{t.step}</td>
                            <td style={{ padding: '5px 8px' }}>
                              <span style={{
                                padding: '1px 6px', borderRadius: 3, fontSize: 9, fontWeight: 700,
                                background: isBuy ? 'rgba(74,222,128,0.1)' : 'rgba(248,113,113,0.1)',
                                color: isBuy ? C.green : C.red,
                              }}>
                                {isBuy ? '▲ BUY' : '▼ SELL'}
                              </span>
                            </td>
                            <td style={{ padding: '5px 8px', textAlign: 'right', color: C.text }}>{t.quantity}</td>
                            <td style={{ padding: '5px 8px', textAlign: 'right', color: C.text }}>₹{t.price?.toFixed(2)}</td>
                            <td style={{ padding: '5px 8px', textAlign: 'right', color: C.muted }}>₹{Math.round(t.portfolio_value || 0).toLocaleString()}</td>
                            <td style={{ padding: '5px 8px', textAlign: 'center' }}>
                              <span style={{
                                padding: '1px 6px', borderRadius: 3, fontSize: 8, fontWeight: 700,
                                background: isBlocked ? 'rgba(248,113,113,0.1)' : 'rgba(74,222,128,0.1)',
                                color: isBlocked ? C.red : C.green,
                              }}>
                                {isBlocked ? '✕ BLOCKED' : '✓ OK'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* ── AI Pipeline Expanded ── */}
            {openSection === 'pipeline' && (
              <div style={{
                marginTop: 8, padding: '12px 14px',
                borderRadius: 6, border: '1px solid rgba(168,85,247,0.15)',
                background: 'rgba(168,85,247,0.03)',
              }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[
                    {
                      step: '① Perceive',
                      color: C.cyan,
                      content: (() => {
                        const obs = mem?.observation;
                        if (!obs || typeof obs !== 'object') return 'No observation yet';
                        const pairs = Object.entries(obs)
                          .filter(([, v]) => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')
                          .slice(0, 6);
                        if (pairs.length === 0) return 'Observation captured';
                        return pairs.map(([k, v]) => `${k}: ${typeof v === 'number' ? fmt(v) : v}`).join(' · ');
                      })(),
                    },
                    {
                      step: '② Reason',
                      color: C.purple,
                      content: memDecision.reasoning || agent.last_reasoning || 'Awaiting first step...',
                    },
                    {
                      step: '③ Act',
                      color: C.amber,
                      content: `${memAction.action || agent.last_action || 'HOLD'} · Quantity: ${memAction.quantity ?? 0}`,
                    },
                    {
                      step: '④ Result',
                      color: C.green,
                      content: memResult
                        ? `Reward: ${fmt(memResult.reward)} · PnL: ${fmt(perf.pnl)} · W/L: ${perf.wins ?? 0}/${perf.losses ?? 0}`
                        : 'Run a step to see results',
                    },
                  ].map((s, i) => (
                    <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <div style={{
                        flexShrink: 0, width: 80,
                        fontSize: 10, fontWeight: 700, color: s.color,
                        fontFamily: "'JetBrains Mono', monospace",
                        paddingTop: 2,
                      }}>
                        {s.step}
                      </div>
                      <div style={{
                        flex: 1, fontSize: 10, color: C.text, lineHeight: 1.6,
                        fontFamily: "'JetBrains Mono', monospace",
                        padding: '4px 8px', borderRadius: 4,
                        background: 'rgba(255,255,255,0.03)',
                        borderLeft: `2px solid ${s.color}33`,
                        wordBreak: 'break-word',
                      }}>
                        {s.content}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Memory count */}
                <div style={{
                  marginTop: 8, display: 'flex', justifyContent: 'flex-end',
                  fontSize: 9, color: C.muted, fontFamily: "'JetBrains Mono', monospace",
                }}>
                  Memory buffer: {agent.memory_size ?? 0} entries
                </div>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
