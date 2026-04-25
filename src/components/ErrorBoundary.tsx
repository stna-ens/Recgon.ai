'use client';

import { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Contextual label, e.g. "Analytics" — surfaces in the fallback. */
  scope?: string;
  /** Optional override for the recovery action. Defaults to a soft retry. */
  fallback?: (reset: () => void, error: Error) => ReactNode;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('[ErrorBoundary]', error);
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (this.props.fallback) {
      return this.props.fallback(this.reset, error);
    }

    const scope = this.props.scope;

    return (
      <div className="page-fade-in" style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', minHeight: '60vh', gap: 16, textAlign: 'center', padding: 32,
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: 16,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(255, 59, 48, 0.08)',
          border: '1px solid rgba(255, 59, 48, 0.2)',
          color: 'var(--danger)',
        }}>
          <svg width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 24 24">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        </div>
        {scope && (
          <span className="recgon-label" style={{ margin: 0 }}>{scope}</span>
        )}
        <h2 style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.3px' }}>
          Something went sideways
        </h2>
        <p style={{ color: 'var(--txt-muted)', maxWidth: 420, lineHeight: 1.6, fontSize: 13.5 }}>
          {error.message || 'An unexpected error occurred. Try again — if it keeps happening, refresh the page.'}
        </p>
        <div style={{ display: 'inline-flex', gap: 10 }}>
          <button className="btn btn-primary btn-sm" onClick={this.reset}>
            Try again
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => { if (typeof window !== 'undefined') window.location.reload(); }}
          >
            Reload page
          </button>
        </div>
      </div>
    );
  }
}
