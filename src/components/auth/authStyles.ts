// Shared styles for the three auth surfaces (/login, /register,
// /forgot-password). Kept as a template string injected via <style> so the
// pages stay self-contained client components without a CSS-module rename.
export const authStyles = `
  .auth-page {
    width: 100vw;
    min-height: 100vh;
    /* body is overflow:hidden app-wide — the auth page owns its own
       scrolling so short viewports / high zoom can still reach every
       field (WCAG 1.4.10 reflow). */
    max-height: 100vh;
    overflow-y: auto;
    display: flex;
    padding: 24px;
    box-sizing: border-box;
  }
  .auth-wrap {
    display: flex;
    align-items: center;
    /* margin:auto centers like align/justify-center but stays reachable
       when content overflows the viewport (flex-centering clips the top). */
    margin: auto;
    gap: clamp(3rem, 8vw, 10rem);
  }
  .auth-col {
    width: min(400px, 100%);
  }
  .auth-title {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--txt-pure);
    margin: 0 0 0.3rem;
    letter-spacing: -0.3px;
  }
  .auth-sub {
    color: var(--txt-muted);
    margin: 0 0 2rem;
    font-size: 0.875rem;
  }
  .auth-form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .auth-submit {
    width: 100%;
    margin-top: 0.25rem;
  }
  .auth-alert {
    padding: 0.6rem 0.75rem;
    background: rgba(var(--danger-rgb), 0.08);
    border: 1px solid rgba(var(--danger-rgb), 0.3);
    border-radius: var(--r-sm);
    color: var(--danger);
    font-size: 0.85rem;
    margin: 0;
  }
  .auth-notice {
    padding: 0.6rem 0.75rem;
    background: rgba(var(--success-rgb), 0.08);
    border: 1px solid rgba(var(--success-rgb), 0.3);
    border-radius: var(--r-sm);
    color: var(--success);
    font-size: 0.85rem;
    margin: 0;
  }
  .auth-forgot {
    margin: -0.5rem 0 0;
    font-size: 0.825rem;
    text-align: right;
  }
  .auth-divider {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin: 1.25rem 0 0;
  }
  .auth-divider-line {
    flex: 1;
    height: 1px;
    background: var(--btn-secondary-border);
  }
  .auth-divider-text {
    font-size: 0.78rem;
    color: var(--txt-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .auth-oauth {
    width: 100%;
    padding: 0.7rem;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.6rem;
    background: var(--btn-secondary-bg);
    color: var(--txt-pure);
    border: 1px solid var(--btn-secondary-border);
    border-radius: var(--r-sm);
    font-weight: 600;
    font-size: 0.95rem;
    cursor: pointer;
    margin-top: 0.75rem;
  }
  .auth-oauth:hover { border-color: var(--rule-strong); }
  .auth-oauth:focus-visible { outline: none; box-shadow: var(--focus-ring); }
  .auth-oauth:disabled { opacity: 0.6; cursor: default; }
  .auth-oauth-spinner {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: 2px solid rgba(var(--signature-rgb), 0.25);
    border-top-color: var(--signature);
    animation: authOauthSpin 0.7s linear infinite;
  }
  @keyframes authOauthSpin { to { transform: rotate(360deg); } }
  .auth-foot {
    text-align: center;
    margin: 1.5rem 0 0;
    font-size: 0.875rem;
    color: var(--txt-muted);
  }
  .auth-foot-link {
    color: var(--txt-pure);
    font-weight: 500;
    text-decoration: none;
  }
  .auth-foot-link:hover { text-decoration: underline; }
  .auth-link-btn {
    background: none;
    border: none;
    font-weight: 500;
    font-size: 0.875rem;
    padding: 0;
  }
  .auth-link-btn:disabled { cursor: default; }
  .auth-back {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    background: none;
    border: none;
    color: var(--txt-muted);
    font-size: 0.85rem;
    cursor: pointer;
    padding: 0;
    margin-bottom: 1.5rem;
  }
  .auth-back:hover { color: var(--txt-pure); }
  .auth-otp {
    text-align: center;
    font-size: 1.5rem;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    letter-spacing: 0.4rem;
  }

  /* Feature panel */
  .auth-feature { width: 360px; }
  .auth-brand {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    margin-bottom: 3.5rem;
  }
  .auth-brand-name {
    font-weight: 700;
    font-size: 1.25rem;
    color: var(--signature);
    letter-spacing: -0.3px;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
  }
  .auth-hero {
    font-size: 2rem;
    font-weight: 700;
    color: var(--txt-pure);
    line-height: 1.2;
    margin: 0 0 0.75rem;
    letter-spacing: -0.5px;
  }
  .auth-hero-sub {
    color: var(--txt-muted);
    font-size: 0.95rem;
    margin: 0 0 3rem;
    line-height: 1.6;
  }
  .auth-feature-list {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }
  .auth-feature-row {
    display: flex;
    gap: 1rem;
    align-items: flex-start;
  }
  .auth-feature-icon {
    flex-shrink: 0;
    width: 38px;
    height: 38px;
    border-radius: 10px;
    background: rgba(var(--signature-rgb), 0.07);
    border: 1px solid rgba(var(--signature-rgb), 0.2);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--signature);
  }
  .auth-feature-title {
    margin: 0 0 0.2rem;
    font-weight: 600;
    font-size: 0.9rem;
    color: var(--txt-pure);
  }
  .auth-feature-desc {
    margin: 0;
    font-size: 0.825rem;
    color: var(--txt-muted);
    line-height: 1.5;
  }

  @media (max-width: 880px) {
    .auth-wrap { gap: 0; }
    .auth-feature { display: none; }
  }
`;
