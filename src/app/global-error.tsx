'use client';

// Last-resort boundary: replaces the root layout when even that fails to
// render. No providers exist here (i18n included), so copy stays hardcoded
// English and styles are inline.

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0a0a0c',
          color: '#e8e8ea',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div style={{ maxWidth: 440, padding: '2rem', textAlign: 'left' }}>
          <p
            style={{
              fontFamily: 'ui-monospace, monospace',
              fontSize: '0.7rem',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: '#f0b8d0',
              margin: '0 0 0.75rem',
            }}
          >
            {'// something broke'}
          </p>
          <h1 style={{ fontSize: '1.25rem', margin: '0 0 0.5rem' }}>Recgon hit an unexpected error.</h1>
          <p style={{ fontSize: '0.9rem', color: '#9a9aa0', lineHeight: 1.55, margin: '0 0 1.25rem' }}>
            Your data is fine. Reload the page — if this keeps happening, sign out and back in.
          </p>
          <button
            onClick={reset}
            style={{
              padding: '0.6rem 1.25rem',
              borderRadius: 8,
              border: 'none',
              background: '#f0b8d0',
              color: '#0a0a0c',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
          {error.digest && (
            <p style={{ fontFamily: 'ui-monospace, monospace', fontSize: '0.7rem', opacity: 0.5, marginTop: '1rem' }}>
              {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
