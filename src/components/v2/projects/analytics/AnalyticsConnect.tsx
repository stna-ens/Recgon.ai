'use client';

import { useCallback, useState } from 'react';
import type { GAProperty, PropertyConfig } from './types';
import { propIdOf } from './utils';

interface Props {
  isOwner: boolean;
  teamId: string | undefined;
  currentTeamName: string | undefined;
  propertyConfig: PropertyConfig | null;
  availableProperties: GAProperty[];
  propertiesLoading: boolean;
  propertiesError: string;
  oauthHref: string;
  oauthConfigured: boolean;
  setupSaving: boolean;
  setupError: string | null;
  onPickProperty: (id: string) => void;
  onRetryProperties: () => void;
  onSubmitServiceAccount: (propertyIdInput: string, serviceAccountJson: string) => Promise<void>;
  onReload: () => void;
}

// GA4 connect flow. Shown when the project has no property linked yet
// (or the team has no credentials at all). Two paths:
//   1) OAuth — primary path when configured server-side (META_APP env vars)
//   2) Service account JSON — fallback / manual path (drop zone or paste)
// Property picker appears when the team already has creds + ≥1 property.
export default function AnalyticsConnect({
  isOwner,
  teamId,
  currentTeamName,
  propertyConfig,
  availableProperties,
  propertiesLoading,
  propertiesError,
  oauthHref,
  oauthConfigured,
  setupSaving,
  setupError,
  onPickProperty,
  onRetryProperties,
  onSubmitServiceAccount,
  onReload,
}: Props) {
  const [propertyIdInput, setPropertyIdInput] = useState('');
  const [serviceAccountJson, setServiceAccountJson] = useState('');
  const [serviceAccountFileName, setServiceAccountFileName] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleServiceAccountFile = useCallback((file: File) => {
    setLocalError(null);
    if (!file.name.endsWith('.json')) {
      setLocalError('Please upload a .json file');
      return;
    }
    if (file.size > 50_000) {
      setLocalError('File too large — service account keys are typically under 5 KB');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = String(ev.target?.result ?? '');
        const parsed = JSON.parse(text);
        if (!parsed.client_email || !parsed.private_key) {
          setLocalError('Invalid service account key — missing client_email or private_key');
          return;
        }
        setServiceAccountJson(text);
        setServiceAccountFileName(file.name);
      } catch {
        setLocalError('Invalid JSON file');
      }
    };
    reader.onerror = () => setLocalError('Could not read file');
    reader.readAsText(file);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!/^\d+$/.test(propertyIdInput.trim())) {
      setLocalError('Property ID must be numeric (e.g. 123456789)');
      return;
    }
    if (!serviceAccountJson.trim()) {
      setLocalError('Paste or drop a service account JSON key');
      return;
    }
    setLocalError(null);
    await onSubmitServiceAccount(propertyIdInput.trim(), serviceAccountJson);
  }, [propertyIdInput, serviceAccountJson, onSubmitServiceAccount]);

  const apiNotEnabled = propertiesError.includes('has not been used') || propertiesError.includes('disabled');

  return (
    <div className="v2-an">
      <header className="v2-an-head">
        <div>
          <span className="recgon-label v2-eyebrow">› analytics</span>
          <h2 className="v2-an-title">
            <span className="v2-pink">connect</span> GA4 first.
          </h2>
        </div>
        <a
          href="https://support.google.com/analytics/answer/9304153"
          target="_blank"
          rel="noopener noreferrer"
          className="v2-an-link"
        >
          new to GA4? help →
        </a>
      </header>

      {availableProperties.length > 0 && (
        <section className="glass-card is-static v2-an-setup-card">
          <span className="recgon-label v2-block-eye">pick a property</span>
          <p className="v2-an-prose">Recgon already has access to your account. Pick the GA4 property you want to track for this project.</p>
          <div className="v2-an-setup-row">
            <select
              onChange={(e) => onPickProperty(e.target.value)}
              className="v2-input v2-select"
              defaultValue=""
              aria-label="GA4 property"
            >
              <option value="" disabled>select a property…</option>
              {availableProperties.map((p) => {
                const id = propIdOf(p);
                return (
                  <option key={id} value={id}>
                    {p.displayName ? `${p.displayName} · ${id}` : id}
                    {p.accountName ? ` · ${p.accountName}` : ''}
                  </option>
                );
              })}
            </select>
          </div>
          {propertiesError && <p className="v2-an-setup-err">{propertiesError}</p>}
        </section>
      )}

      {propertiesLoading && availableProperties.length === 0 && (
        <div className="v2-an-stage">
          <span className="recgon-label">› loading your properties</span>
          <div className="v2-an-stage-bar" />
        </div>
      )}

      {!propertiesLoading && propertiesError && availableProperties.length === 0 && (
        <div className="v2-an-err-card">
          {apiNotEnabled ? (
            <>
              <p className="v2-an-err-title">! Google Analytics Admin API is not enabled</p>
              <ol className="v2-an-err-steps">
                <li>Go to <strong>Google Cloud Console → APIs &amp; Services → Library</strong></li>
                <li>Search for <strong>&quot;Google Analytics Admin API&quot;</strong> and click Enable</li>
                <li>Wait 1–2 minutes, then click <strong>retry</strong> below</li>
              </ol>
            </>
          ) : (
            <p className="v2-an-err-title">! {propertiesError}</p>
          )}
          <div className="v2-an-err-actions">
            <button type="button" className="v2-btn v2-btn-ghost" onClick={onRetryProperties} disabled={propertiesLoading}>
              retry
            </button>
          </div>
        </div>
      )}

      <section className="glass-card is-static v2-an-setup-card">
        <span className="recgon-label v2-block-eye">connect GA4</span>
        <p className="v2-an-prose">
          Pair this project with a GA4 property to see traffic, channels, and the mentor&apos;s read on what&apos;s actually moving the needle. Connecting{' '}
          <strong>{teamId ? `for team "${currentTeamName ?? ''}"` : 'this project'}</strong>.
        </p>

        {!isOwner && currentTeamName && (
          <p className="v2-an-retry-hint">
            Only team owners can connect Google Analytics for the team. Ask <strong>{currentTeamName}</strong>&apos;s owner to connect.
          </p>
        )}

        {oauthConfigured && oauthHref && (
          <div className="v2-an-oauth-card">
            <p className="v2-an-prose">Sign in with your Google account to grant Recgon read-only access to your analytics.</p>
            <a
              href={isOwner ? oauthHref : '#'}
              className="v2-btn v2-btn-primary"
              style={!isOwner ? { pointerEvents: 'none', opacity: 0.5 } : undefined}
              aria-disabled={!isOwner}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              connect with google
            </a>
            <p className="v2-an-oauth-foot">read-only access — recgon can only view your analytics data</p>
          </div>
        )}

        {oauthConfigured && (
          <div className="v2-an-or">
            <span className="v2-an-or-line" />
            <span className="v2-an-or-text">or</span>
            <span className="v2-an-or-line" />
          </div>
        )}

        {(!oauthConfigured || showManual) ? (
          <>
            <details className="v2-an-guide" open>
              <summary>How to get a service account key (5 steps)</summary>
              <ol className="v2-an-guide-list">
                <li><strong>Google Cloud Console</strong> → APIs &amp; Services → Library → search for <em>Google Analytics Data API</em> and enable it.</li>
                <li><strong>IAM &amp; Admin</strong> → Service Accounts → Create Service Account (skip role grants).</li>
                <li>Open the created service account → <strong>Keys</strong> tab → Add Key → Create new key → <strong>JSON</strong> → download.</li>
                <li>Drop the downloaded file below or paste its contents.</li>
                <li>In <strong>Google Analytics</strong> → Admin → <strong>Property Access Management</strong> → click + → add the service account&apos;s email (the <code>client_email</code> in the JSON) with <strong>Viewer</strong> role.</li>
              </ol>
            </details>

            <label className="v2-an-field">
              <span className="v2-an-field-label">service account key (JSON)</span>
              <div
                className={`v2-an-drop ${dragOver ? 'is-over' : ''} ${serviceAccountJson ? 'is-loaded' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  const f = e.dataTransfer.files[0];
                  if (f) handleServiceAccountFile(f);
                }}
                onClick={() => document.getElementById('v2-an-sa-input')?.click()}
              >
                <input
                  id="v2-an-sa-input"
                  type="file"
                  accept=".json"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleServiceAccountFile(f);
                    e.target.value = '';
                  }}
                />
                {serviceAccountJson ? (
                  <span className="v2-an-drop-loaded">
                    ✓ {serviceAccountFileName || 'key loaded'} — click to replace
                  </span>
                ) : (
                  <>
                    <span className="v2-an-drop-prompt">Drop your <strong>.json</strong> key file here or click to browse</span>
                    <span className="v2-an-drop-sub">or paste the JSON below</span>
                  </>
                )}
              </div>
              <textarea
                value={serviceAccountJson}
                onChange={(e) => { setServiceAccountJson(e.target.value); setServiceAccountFileName(''); }}
                placeholder={'{\n  "type": "service_account",\n  "client_email": "...",\n  "private_key": "..."\n}'}
                rows={5}
                className="v2-input v2-textarea v2-an-json"
              />
            </label>

            <label className="v2-an-field">
              <span className="v2-an-field-label">GA4 property ID</span>
              <input
                type="text"
                value={propertyIdInput}
                onChange={(e) => setPropertyIdInput(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="e.g. 123456789"
                className="v2-input v2-an-prop-input"
              />
              <span className="v2-an-field-help">Google Analytics → Admin → Property details → numeric Property ID (not the Measurement ID).</span>
            </label>

            {(localError || setupError) && (
              <p className="v2-an-setup-err">{localError ?? setupError}</p>
            )}

            <div className="v2-an-setup-actions">
              <button
                type="button"
                className="v2-btn v2-btn-primary"
                onClick={handleSubmit}
                disabled={setupSaving || !propertyIdInput.trim() || !serviceAccountJson.trim() || !isOwner}
              >
                {setupSaving ? <><span className="v2-an-spinner" /> connecting…</> : 'connect property'}
              </button>
              <button
                type="button"
                className="v2-btn v2-btn-ghost"
                onClick={onReload}
                disabled={setupSaving}
              >
                retry
              </button>
            </div>

            {setupSaving && (
              <p className="v2-an-retry-hint">Just connected? Wait 1–2 minutes for the property to propagate, then click <strong>retry</strong> above.</p>
            )}
          </>
        ) : (
          <button
            type="button"
            className="v2-btn v2-btn-ghost v2-an-fallback"
            onClick={() => setShowManual(true)}
          >
            use service account instead
          </button>
        )}

        {/* This block is visible regardless of propertyConfig content
            (the page passes config through). When no creds at all, the
            empty layout above renders fine. */}
        {!propertyConfig && null}
      </section>
    </div>
  );
}
