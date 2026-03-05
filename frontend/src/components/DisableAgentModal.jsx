import React from 'react';

/**
 * Confirmation modal shown when the user disables an agent that has
 * open positions mid-simulation.
 *
 * Props:
 *  - agentKey      : string   — e.g. "momentum"
 *  - agentLabel    : string   — display name e.g. "Momentum"
 *  - positions     : object   — { AAPL: 50, TSLA: 10, ... }
 *  - currentPrice  : number   — current market price (from snapshot)
 *  - onSellDisable : fn()     — sell all positions THEN disable
 *  - onJustDisable : fn()     — disable without selling (holdings float)
 *  - onCancel      : fn()     — close modal, keep agent active
 */
export default function DisableAgentModal({
  agentLabel,
  positions = {},
  currentPrice = 0,
  onSellDisable,
  onJustDisable,
  onCancel,
}) {
  const tickers = Object.entries(positions).filter(([, qty]) => qty > 0);
  const totalHoldingsValue = tickers.reduce((sum, [, qty]) => sum + qty * currentPrice, 0);

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div
        className="modal-content"
        style={{ maxWidth: 420 }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-header">
          <h2>Disable {agentLabel}</h2>
          <button className="modal-close" onClick={onCancel}>✕</button>
        </div>

        {/* Body */}
        <div style={{ padding: '1rem 1.25rem' }}>
          {tickers.length > 0 ? (
            <>
              <p style={{ marginBottom: '0.75rem', color: 'var(--text-secondary, #aaa)' }}>
                This agent holds open positions. What would you like to do?
              </p>

              {/* Holdings table */}
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1rem', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border, #333)' }}>
                    <th style={{ textAlign: 'left', padding: '4px 6px', color: 'var(--text-secondary, #aaa)' }}>Ticker</th>
                    <th style={{ textAlign: 'right', padding: '4px 6px', color: 'var(--text-secondary, #aaa)' }}>Qty</th>
                    <th style={{ textAlign: 'right', padding: '4px 6px', color: 'var(--text-secondary, #aaa)' }}>Est. Value</th>
                  </tr>
                </thead>
                <tbody>
                  {tickers.map(([ticker, qty]) => (
                    <tr key={ticker} style={{ borderBottom: '1px solid var(--border, #222)' }}>
                      <td style={{ padding: '4px 6px', fontWeight: 600 }}>{ticker}</td>
                      <td style={{ padding: '4px 6px', textAlign: 'right' }}>{qty.toLocaleString()}</td>
                      <td style={{ padding: '4px 6px', textAlign: 'right' }}>
                        ${(qty * currentPrice).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={2} style={{ padding: '6px 6px', fontWeight: 700, fontSize: '0.9rem' }}>Total</td>
                    <td style={{ padding: '6px 6px', textAlign: 'right', fontWeight: 700, color: 'var(--accent, #4fc3f7)' }}>
                      ${totalHoldingsValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </>
          ) : (
            <p style={{ marginBottom: '1rem', color: 'var(--text-secondary, #aaa)' }}>
              This agent has no open positions. Disable immediately?
            </p>
          )}

          {/* Buttons */}
          <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end' }}>
            <button
              className="btn btn-ghost"
              onClick={onCancel}
              style={{ padding: '0.45rem 1rem' }}
            >
              Cancel
            </button>

            <button
              className="btn btn-secondary"
              onClick={onJustDisable}
              style={{ padding: '0.45rem 1rem' }}
            >
              Just Disable
            </button>

            {tickers.length > 0 && (
              <button
                className="btn btn-primary"
                onClick={onSellDisable}
                style={{ padding: '0.45rem 1rem', background: 'var(--danger, #e57373)', borderColor: 'var(--danger, #e57373)' }}
              >
                Sell &amp; Disable
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
