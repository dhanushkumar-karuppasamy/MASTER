import React, { useMemo, useRef, useState } from 'react';

const STRESS_TESTS = [
  { value: '', label: 'None (use top period selector)' },
  { value: '2008_crisis', label: '2008 Financial Crisis (2008-08-01 → 2008-12-31)' },
  { value: 'covid_crash', label: 'COVID Crash (2020-02-01 → 2020-04-30)' },
];

export default function ResearchPanel({
  stressTest,
  setStressTest,
  csvFileName,
  onCsvFileChange,
  optimizerConfig,
  setOptimizerConfig,
  onRunOptimizer,
  optimizerResults,
  optimizerRunning,
  optimizerError,
  allAgents = [],
  status,
}) {
  const fileInputRef = useRef(null);
  const [localError, setLocalError] = useState('');

  const safeResults = useMemo(
    () => (Array.isArray(optimizerResults) ? optimizerResults : []),
    [optimizerResults]
  );

  const updateOptimizer = (key, value) => {
    setOptimizerConfig(prev => ({ ...prev, [key]: value }));
  };

  const handleRunOptimizer = async () => {
    setLocalError('');
    try {
      await onRunOptimizer?.();
    } catch (err) {
      setLocalError(err?.message || 'Optimization failed. Please check your inputs and try again.');
    }
  };

  return (
    <div className="research-panel-wrap">
      <section className="card research-card-modern">
        <div className="research-section-head">
          <p className="research-kicker">1. Data &amp; Environment</p>
          <h2>Research Environment Settings</h2>
        </div>

        <div className="research-stack">
          <label>
            <span className="label-text">Select Historical Scenario</span>
            <select
              value={stressTest || ''}
              onChange={e => setStressTest?.(e.target.value)}
              className="compact-select"
            >
              {STRESS_TESTS.map(s => (
                <option key={s.value || 'none'} value={s.value}>{s.label}</option>
              ))}
            </select>
          </label>

          <div className="csv-upload-block soft-tint">
            <span className="label-text">Alternative Data (CSV)</span>
            <p className="csv-upload-help">
              Upload custom dataset signals to merge with market bars. These columns become available to advanced/code agents.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={e => onCsvFileChange?.(e.target.files?.[0] || null)}
              style={{ display: 'none' }}
            />
            <button
              type="button"
              className="btn-step csv-upload-btn"
              onClick={() => fileInputRef.current?.click()}
            >
              ⬆ Upload CSV Dataset
            </button>
            <div className="csv-upload-filename" title={csvFileName || 'No CSV selected'}>
              {csvFileName || 'No file selected'}
            </div>
          </div>
        </div>
      </section>

      <section className="card research-card-modern">
        <div className="research-section-head">
          <p className="research-kicker">2. Strategy Optimizer</p>
          <h2>Hyperparameter Optimization</h2>
        </div>

        <div className="research-stack">
          <label>
            <span className="label-text">Target Agent</span>
            <select
              value={optimizerConfig?.targetAgent || 'custom'}
              onChange={e => updateOptimizer('targetAgent', e.target.value)}
              className="compact-select"
            >
              {allAgents.map(a => (
                <option key={a.key} value={a.key}>{a.label}</option>
              ))}
            </select>
          </label>

          <label>
            <span className="label-text">Parameter Name</span>
            <input
              type="text"
              value={optimizerConfig?.parameter || ''}
              onChange={e => updateOptimizer('parameter', e.target.value)}
              className="follower-input"
              style={{ width: '100%', maxWidth: '100%' }}
              placeholder="basic.position_size_pct"
            />
          </label>

          <label>
            <span className="label-text">Min Value</span>
            <input
              type="number"
              step="any"
              value={optimizerConfig?.min ?? 0}
              onChange={e => updateOptimizer('min', Number(e.target.value))}
              className="follower-input"
              style={{ width: '100%', maxWidth: '100%' }}
            />
          </label>

          <label>
            <span className="label-text">Max Value</span>
            <input
              type="number"
              step="any"
              value={optimizerConfig?.max ?? 0}
              onChange={e => updateOptimizer('max', Number(e.target.value))}
              className="follower-input"
              style={{ width: '100%', maxWidth: '100%' }}
            />
          </label>

          <label>
            <span className="label-text">Step</span>
            <input
              type="number"
              step="any"
              min="0.000001"
              value={optimizerConfig?.step ?? 0.01}
              onChange={e => updateOptimizer('step', Number(e.target.value))}
              className="follower-input"
              style={{ width: '100%', maxWidth: '100%' }}
            />
          </label>

          <button
            className="btn-run"
            onClick={handleRunOptimizer}
            disabled={optimizerRunning || status === 'idle'}
            style={{ marginTop: 8, width: '100%' }}
          >
            {optimizerRunning ? '⏳ Running Optimization...' : '🧠 Run Optimization'}
          </button>

          {(optimizerError || localError) && (
            <div className="research-error-msg">
              {localError || optimizerError}
            </div>
          )}

          <div className="optimizer-results-panel soft-tint">
            <h3>Results</h3>
            {safeResults.length ? (
              <div className="optimizer-results-list">
                {safeResults.map((r, idx) => (
                  <div key={`${r.parameter_value}-${idx}`} className="optimizer-result-item">
                    <div className="optimizer-result-main">
                      <span className="optimizer-param">Param: {r.parameter_value}</span>
                      {r.error ? (
                        <span className="optimizer-run-error">{r.error}</span>
                      ) : (
                        <span className="optimizer-value">Portfolio: {r.final_portfolio_value ?? '—'}</span>
                      )}
                    </div>
                    {!r.error && (
                      <div className="optimizer-result-sub">
                        <span>Return: {r.final_return_pct ?? '—'}%</span>
                        <span>Max DD: {r.max_drawdown_pct ?? '—'}%</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="optimizer-empty-text">
                No optimization results yet. Configure parameters and click “Run Optimization”.
              </p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
