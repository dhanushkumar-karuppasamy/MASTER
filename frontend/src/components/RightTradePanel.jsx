import React from 'react';

export default function RightTradePanel({
  onStep, onAutoRun, onPause, onInit,
  status, step, maxSteps,
  crashActive, onCrash,
  onOpenSettings,
}) {
  return (
    <div className="olymp-right-panel">
      <div className="panel-section">
        <h3>Execution Controls</h3>

        <div className="control-buttons">
          <button className="btn-init" onClick={onInit}>
            ▶ Initialize
          </button>
          <button 
            className="btn-step" 
            onClick={onStep}
            disabled={status === 'finished' || status === 'idle'}
          >
            ⏭ Step
          </button>
          <button 
            className="btn-run" 
            onClick={onAutoRun}
            disabled={status === 'running' || status === 'finished' || status === 'idle'}
          >
            ⏩ Run
          </button>
          <button 
            className="btn-pause" 
            onClick={onPause}
            disabled={status !== 'running'}
          >
            ⏸ Pause
          </button>
        </div>

        <button 
          className={`btn-crash-panel ${crashActive ? 'active' : ''}`}
          onClick={onCrash}
          disabled={status === 'idle' || status === 'finished'}
        >
          ⚡ Trigger Crash
        </button>

        <button
          className="btn-settings-panel"
          onClick={onOpenSettings}
        >
          ◈ Agent Settings
        </button>

        <div className="status-info">
          <div className="status-row">
            <span className="status-label">Status</span>
            <span className={`status-badge status-${status}`}>
              {status.toUpperCase()}
            </span>
          </div>
          <div className="status-row">
            <span className="status-label">Progress</span>
            <span className="step-counter">{step} / {maxSteps}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
