import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary] Caught render error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          position: 'fixed', inset: 0, display: 'flex', alignItems: 'center',
          justifyContent: 'center', background: '#07080d', zIndex: 9999,
          flexDirection: 'column', gap: 16, fontFamily: "'JetBrains Mono', monospace",
        }}>
          <div style={{ fontSize: 48 }}>⚠️</div>
          <h2 style={{ color: '#f87171', margin: 0 }}>Something went wrong</h2>
          <p style={{ color: '#94a3b8', fontSize: 13, maxWidth: 500, textAlign: 'center' }}>
            {this.state.error?.message || 'An unexpected error occurred during rendering.'}
          </p>
          <button
            onClick={() => { this.setState({ hasError: false, error: null }); }}
            style={{
              padding: '10px 28px', borderRadius: 6, border: 'none',
              background: '#3b5bdb', color: '#fff', fontWeight: 700,
              cursor: 'pointer', fontSize: 14, fontFamily: 'inherit',
            }}
          >
            Try Again
          </button>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '8px 20px', borderRadius: 6, border: '1px solid #334155',
              background: 'transparent', color: '#94a3b8',
              cursor: 'pointer', fontSize: 12, fontFamily: 'inherit',
            }}
          >
            Reload Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
