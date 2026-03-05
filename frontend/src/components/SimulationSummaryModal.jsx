import React, { useMemo } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

/* ─────────────────── helpers ─────────────────── */
const fmt2 = v => (typeof v === 'number' ? v.toFixed(2) : '—');
const fmtPct = v => (typeof v === 'number' ? `${v.toFixed(2)}%` : '—');
const fmtMoney = v =>
  typeof v === 'number'
    ? `$${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
    : '—';
const pnlColor = v => (v > 0 ? '#4caf50' : v < 0 ? '#ef5350' : '#aaa');

/* ─────────────────── component ─────────────────── */
export default function SimulationSummaryModal({ snapshot, onClose }) {
  if (!snapshot) return null;

  const {
    ticker = '—',
    period = '—',
    interval = '—',
    step = 0,
    max_steps = 0,
    agents = [],
    trade_log = [],
    regulation_log = [],
    system_risk = {},
    market_summary = '',
    price_history = [],
  } = snapshot;

  /* ── derived stats ── */
  const agentRows = useMemo(() => {
    return agents.map(a => {
      const initial = a.initial_cash ?? 100000;
      const pnl = (a.portfolio_value ?? 0) - initial;
      const pnlPct = initial > 0 ? (pnl / initial) * 100 : 0;
      const wins = a.performance_stats?.wins ?? 0;
      const losses = a.performance_stats?.losses ?? 0;
      const total = wins + losses;
      const winRate = total > 0 ? ((wins / total) * 100).toFixed(1) + '%' : '—';
      return {
        name: a.name ?? '—',
        status: a.status ?? 'ACTIVE',
        initial,
        final: a.portfolio_value ?? 0,
        pnl,
        pnlPct,
        wins,
        losses,
        winRate,
        maxDd: a.max_drawdown_pct ?? 0,
        sharpe: a.sharpe_ratio ?? 0,
        trades: trade_log.filter(t => t.agent === a.name || t.agent_name === a.name).length,
      };
    });
  }, [agents, trade_log]);

  const best = agentRows.reduce((b, r) => (r.pnl > b.pnl ? r : b), agentRows[0] ?? {});
  const worst = agentRows.reduce((b, r) => (r.pnl < b.pnl ? r : b), agentRows[0] ?? {});
  const totalAUM = system_risk.total_aum ?? agents.reduce((s, a) => s + (a.portfolio_value ?? 0), 0);
  const totalInitial = agents.reduce((s, a) => s + (a.initial_cash ?? 100000), 0);
  const totalPnL = totalAUM - totalInitial;
  const totalPnLPct = totalInitial > 0 ? (totalPnL / totalInitial) * 100 : 0;

  const startPrice = price_history[0]?.Close ?? 0;
  const endPrice = price_history[price_history.length - 1]?.Close ?? 0;
  const mktReturn = startPrice > 0 ? ((endPrice - startPrice) / startPrice) * 100 : 0;

  const totalTrades = trade_log.filter(t => t.action !== 'HOLD').length;
  const violations = regulation_log.filter(t => t.decision === 'BLOCK').length;

  /* ── PDF generator ── */
  const handleDownloadPDF = () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const W = doc.internal.pageSize.getWidth();
    let y = 15;

    const addSectionTitle = (text) => {
      if (y > 265) { doc.addPage(); y = 15; }
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(40, 40, 40);
      doc.text(text, 14, y);
      doc.setDrawColor(80, 120, 200);
      doc.setLineWidth(0.4);
      doc.line(14, y + 1.5, W - 14, y + 1.5);
      y += 8;
    };

    // ── Cover ────────────────────────────────────────────────────────────
    doc.setFillColor(25, 35, 60);
    doc.rect(0, 0, W, 42, 'F');
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('Simulation Summary Report', W / 2, 18, { align: 'center' });
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(180, 200, 255);
    doc.text(`Ticker: ${ticker}  |  Period: ${period}  |  Interval: ${interval}`, W / 2, 27, { align: 'center' });
    doc.text(`Steps: ${step} / ${max_steps}  |  Generated: ${new Date().toLocaleString()}`, W / 2, 34, { align: 'center' });
    y = 52;

    // ── Overview badges ─────────────────────────────────────────────────
    addSectionTitle('Simulation Overview');
    const badges = [
      ['Total AUM', fmtMoney(totalAUM)],
      ['Total PnL', `${totalPnL >= 0 ? '+' : ''}${fmtMoney(totalPnL)} (${fmtPct(totalPnLPct)})`],
      ['Market Return', `${fmtPct(mktReturn)}`],
      ['Total Trades', String(totalTrades)],
      ['Violations', String(violations)],
      ['Steps', `${step} / ${max_steps}`],
    ];
    badges.forEach(([label, val], i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const bx = 14 + col * 61;
      const by = y + row * 18;
      doc.setFillColor(240, 244, 255);
      doc.roundedRect(bx, by, 58, 14, 2, 2, 'F');
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 100, 120);
      doc.text(label, bx + 4, by + 5.5);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 30, 60);
      doc.text(val, bx + 4, by + 11);
    });
    y += Math.ceil(badges.length / 3) * 18 + 6;

    // ── Best / Worst ────────────────────────────────────────────────────
    if (best?.name) {
      addSectionTitle('Highlights');
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(40, 40, 40);
      doc.text(`🏆 Best Agent: ${best.name}  —  PnL ${best.pnl >= 0 ? '+' : ''}${fmtMoney(best.pnl)} (${fmtPct(best.pnlPct)})`, 14, y);
      y += 6;
      doc.text(`📉 Worst Agent: ${worst.name}  —  PnL ${worst.pnl >= 0 ? '+' : ''}${fmtMoney(worst.pnl)} (${fmtPct(worst.pnlPct)})`, 14, y);
      y += 10;
    }

    // ── Agent performance table ─────────────────────────────────────────
    addSectionTitle('Agent Performance');
    autoTable(doc, {
      startY: y,
      head: [['Agent', 'Status', 'Final Value', 'PnL', 'PnL %', 'Wins', 'Losses', 'Win Rate', 'Max DD', 'Sharpe', 'Trades']],
      body: agentRows.map(r => [
        r.name,
        r.status,
        fmtMoney(r.final),
        `${r.pnl >= 0 ? '+' : ''}${fmtMoney(r.pnl)}`,
        `${r.pnlPct >= 0 ? '+' : ''}${fmtPct(r.pnlPct)}`,
        String(r.wins),
        String(r.losses),
        r.winRate,
        fmtPct(r.maxDd),
        fmt2(r.sharpe),
        String(r.trades),
      ]),
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [25, 50, 100], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [245, 248, 255] },
      didParseCell(data) {
        if (data.section === 'body' && data.column.index === 3) {
          const v = parseFloat(data.cell.raw.replace(/[$,+]/g, ''));
          data.cell.styles.textColor = v >= 0 ? [30, 140, 30] : [200, 30, 30];
        }
      },
      margin: { left: 14, right: 14 },
    });
    y = doc.lastAutoTable.finalY + 8;

    // ── System risk ─────────────────────────────────────────────────────
    if (y > 250) { doc.addPage(); y = 15; }
    addSectionTitle('System Risk');
    autoTable(doc, {
      startY: y,
      head: [['Metric', 'Value']],
      body: [
        ['Total AUM', fmtMoney(system_risk.total_aum)],
        ['Total Exposure', fmtMoney(system_risk.total_exposure)],
        ['Exposure %', fmtPct(system_risk.exposure_pct)],
        ['Global Drawdown', fmtPct(system_risk.global_drawdown_pct)],
        ['Open Positions', String(system_risk.open_positions_count ?? '—')],
        ['Active Agents', String(system_risk.active_agents ?? '—')],
        ['Regulation Violations', String(violations)],
      ],
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [25, 50, 100], textColor: 255, fontStyle: 'bold' },
      columnStyles: { 1: { fontStyle: 'bold' } },
      margin: { left: 14, right: W / 2 + 10 },
    });
    y = doc.lastAutoTable.finalY + 8;

    // ── Trade log sample ─────────────────────────────────────────────────
    const activeTrades = trade_log.filter(t => t.action && t.action !== 'HOLD').slice(-50);
    if (activeTrades.length > 0) {
      if (y > 240) { doc.addPage(); y = 15; }
      addSectionTitle(`Trade Log (last ${activeTrades.length} trades)`);
      autoTable(doc, {
        startY: y,
        head: [['Step', 'Agent', 'Action', 'Price', 'Qty', 'Portfolio Value', 'Reason']],
        body: activeTrades.map(t => [
          String(t.step ?? ''),
          t.agent ?? t.agent_name ?? '',
          t.action ?? '',
          fmt2(t.price),
          String(t.quantity ?? ''),
          fmtMoney(t.portfolio_value),
          (t.reason ?? t.reasoning ?? '').slice(0, 60),
        ]),
        styles: { fontSize: 6.5, cellPadding: 1.5 },
        headStyles: { fillColor: [25, 50, 100], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [245, 248, 255] },
        columnStyles: { 6: { cellWidth: 55 } },
        margin: { left: 14, right: 14 },
      });
      y = doc.lastAutoTable.finalY + 8;
    }

    // ── Regulation log ───────────────────────────────────────────────────
    const blocks = regulation_log.filter(r => r.decision === 'BLOCK').slice(-30);
    if (blocks.length > 0) {
      if (y > 240) { doc.addPage(); y = 15; }
      addSectionTitle(`Regulation Log — Blocks (${blocks.length})`);
      autoTable(doc, {
        startY: y,
        head: [['Step', 'Agent', 'Rule', 'Decision', 'Explanation']],
        body: blocks.map(r => [
          String(r.step ?? ''),
          r.agent_name ?? r.agent ?? '',
          r.rule_name ?? r.rule ?? '',
          r.decision ?? '',
          (r.explanation ?? '').slice(0, 80),
        ]),
        styles: { fontSize: 6.5, cellPadding: 1.5 },
        headStyles: { fillColor: [140, 30, 30], textColor: 255, fontStyle: 'bold' },
        margin: { left: 14, right: 14 },
      });
      y = doc.lastAutoTable.finalY + 8;
    }

    // ── Market narrative ─────────────────────────────────────────────────
    if (market_summary) {
      if (y > 240) { doc.addPage(); y = 15; }
      addSectionTitle('Market Narrative');
      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(50, 50, 50);
      const lines = doc.splitTextToSize(market_summary, W - 28);
      doc.text(lines, 14, y);
    }

    // ── Footer on every page ─────────────────────────────────────────────
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(150);
      doc.text(`Page ${i} of ${pageCount}  |  MultiAgent Stock Market Simulator`, W / 2, 292, { align: 'center' });
    }

    doc.save(`simulation_${ticker}_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  /* ── render ── */
  return (
    <div className="modal-overlay" style={{ alignItems: 'flex-start', paddingTop: '2vh', overflowY: 'auto' }}>
      <div
        className="modal-content"
        style={{ maxWidth: 860, width: '96%', maxHeight: '94vh', overflowY: 'auto', margin: '0 auto' }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="modal-header" style={{ background: 'linear-gradient(135deg,#1a2a4a 0%,#0d1b33 100%)', borderRadius: '8px 8px 0 0', padding: '1.1rem 1.4rem' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.2rem', color: '#fff' }}>🏁 Simulation Complete</h2>
            <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: '#90b4e8' }}>
              {ticker} · {period} · {interval} · {step}/{max_steps} steps
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
            <button
              onClick={handleDownloadPDF}
              style={{
                padding: '0.45rem 1.1rem', borderRadius: 6, border: 'none',
                background: '#3b5bdb', color: '#fff', fontWeight: 700,
                cursor: 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              ⬇ Download PDF
            </button>
            <button className="modal-close" onClick={onClose} style={{ color: '#ccc' }}>✕</button>
          </div>
        </div>

        <div style={{ padding: '1.25rem 1.4rem', display: 'flex', flexDirection: 'column', gap: '1.4rem' }}>

          {/* ── KPI badges ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: '0.7rem' }}>
            {[
              { label: 'Total AUM', value: fmtMoney(totalAUM), color: '#4fc3f7' },
              { label: 'Total PnL', value: `${totalPnL >= 0 ? '+' : ''}${fmtMoney(totalPnL)}`, color: pnlColor(totalPnL) },
              { label: 'PnL %', value: `${totalPnLPct >= 0 ? '+' : ''}${fmtPct(totalPnLPct)}`, color: pnlColor(totalPnLPct) },
              { label: 'Market Return', value: fmtPct(mktReturn), color: pnlColor(mktReturn) },
              { label: 'Total Trades', value: String(totalTrades), color: '#aaa' },
              { label: 'Violations', value: String(violations), color: violations > 0 ? '#ef5350' : '#66bb6a' },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ background: 'var(--card-bg,#1a1e2e)', borderRadius: 8, padding: '0.65rem 0.8rem', border: '1px solid var(--border,#2a2e44)' }}>
                <div style={{ fontSize: '0.7rem', color: '#888', marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: '1.05rem', fontWeight: 700, color }}>{value}</div>
              </div>
            ))}
          </div>

          {/* ── Best / Worst ── */}
          {best?.name && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.7rem' }}>
              <div style={{ background: '#0d2b1a', border: '1px solid #2a5a3a', borderRadius: 8, padding: '0.7rem 1rem' }}>
                <div style={{ fontSize: '0.72rem', color: '#66bb6a', marginBottom: 4 }}>🏆 Best Agent</div>
                <div style={{ fontWeight: 700, fontSize: '1rem' }}>{best.name}</div>
                <div style={{ color: '#66bb6a', fontSize: '0.9rem' }}>+{fmtMoney(best.pnl)} ({fmtPct(best.pnlPct)})</div>
              </div>
              <div style={{ background: '#2b0d0d', border: '1px solid #5a2a2a', borderRadius: 8, padding: '0.7rem 1rem' }}>
                <div style={{ fontSize: '0.72rem', color: '#ef5350', marginBottom: 4 }}>📉 Worst Agent</div>
                <div style={{ fontWeight: 700, fontSize: '1rem' }}>{worst.name}</div>
                <div style={{ color: '#ef5350', fontSize: '0.9rem' }}>{fmtMoney(worst.pnl)} ({fmtPct(worst.pnlPct)})</div>
              </div>
            </div>
          )}

          {/* ── Agent performance table ── */}
          <div>
            <h3 style={{ margin: '0 0 0.6rem', fontSize: '0.95rem', color: 'var(--text-secondary,#ccc)' }}>Agent Performance</h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                <thead>
                  <tr style={{ background: 'var(--table-header-bg,#1e2540)', borderBottom: '2px solid var(--border,#2a2e44)' }}>
                    {['Agent', 'Status', 'Final Value', 'PnL', 'PnL %', 'Wins', 'Losses', 'Win Rate', 'Max DD', 'Sharpe', 'Trades'].map(h => (
                      <th key={h} style={{ padding: '7px 8px', textAlign: h === 'Agent' ? 'left' : 'right', color: '#90b4e8', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {agentRows.map((r, i) => (
                    <tr key={r.name} style={{ background: i % 2 === 0 ? 'var(--row-even,#181c2e)' : 'var(--row-odd,#1a1e2e)', borderBottom: '1px solid var(--border,#2a2e44)' }}>
                      <td style={{ padding: '6px 8px', fontWeight: 600 }}>{r.name}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                        <span style={{ fontSize: '0.72rem', padding: '2px 6px', borderRadius: 4, background: r.status === 'ACTIVE' ? '#1a3a1a' : r.status === 'HALTED' ? '#3a1a0a' : '#1a1a2a', color: r.status === 'ACTIVE' ? '#66bb6a' : r.status === 'HALTED' ? '#ffa726' : '#888' }}>
                          {r.status}
                        </span>
                      </td>
                      <td style={{ padding: '6px 8px', textAlign: 'right' }}>{fmtMoney(r.final)}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', color: pnlColor(r.pnl), fontWeight: 600 }}>
                        {r.pnl >= 0 ? '+' : ''}{fmtMoney(r.pnl)}
                      </td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', color: pnlColor(r.pnlPct) }}>
                        {r.pnlPct >= 0 ? '+' : ''}{fmtPct(r.pnlPct)}
                      </td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', color: '#66bb6a' }}>{r.wins}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', color: '#ef5350' }}>{r.losses}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right' }}>{r.winRate}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', color: r.maxDd < -10 ? '#ef5350' : '#aaa' }}>{fmtPct(r.maxDd)}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right' }}>{fmt2(r.sharpe)}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right' }}>{r.trades}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Market narrative ── */}
          {market_summary && (
            <div style={{ background: 'var(--card-bg,#1a1e2e)', border: '1px solid var(--border,#2a2e44)', borderRadius: 8, padding: '0.9rem 1rem' }}>
              <h3 style={{ margin: '0 0 0.5rem', fontSize: '0.9rem', color: 'var(--text-secondary,#ccc)' }}>📋 Market Narrative</h3>
              <p style={{ margin: 0, fontSize: '0.83rem', color: '#bbb', lineHeight: 1.6 }}>{market_summary}</p>
            </div>
          )}

          {/* ── Close / Download footer ── */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.7rem', paddingTop: '0.25rem' }}>
            <button className="btn btn-ghost" onClick={onClose} style={{ padding: '0.5rem 1.3rem' }}>Close</button>
            <button
              onClick={handleDownloadPDF}
              style={{ padding: '0.5rem 1.4rem', borderRadius: 6, border: 'none', background: '#3b5bdb', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '0.88rem' }}
            >
              ⬇ Download PDF Report
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
