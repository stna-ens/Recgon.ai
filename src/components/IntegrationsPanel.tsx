'use client';

import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/components/Toast';

type IntegrationStatus = {
  provider: 'instagram';
  accountHandle: string | null;
  connectedAt: string;
  expiresAt: string | null;
};

export function IntegrationsPanel({
  projectId,
  teamId,
}: {
  projectId: string;
  teamId: string;
}) {
  const { addToast } = useToast();
  const [integrations, setIntegrations] = useState<IntegrationStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/integrations/status?projectId=${projectId}&teamId=${teamId}`);
    if (res.ok) {
      const data = (await res.json()) as { integrations: IntegrationStatus[] };
      setIntegrations(data.integrations);
    }
    setLoading(false);
  }, [projectId, teamId]);

  useEffect(() => {
    refresh();
    // Surface OAuth callback result toasts.
    const params = new URLSearchParams(window.location.search);
    const ig = params.get('ig');
    if (ig === 'connected') {
      const handle = params.get('handle');
      addToast(`Instagram connected${handle ? ` (@${handle})` : ''}`, 'success');
      window.history.replaceState({}, '', window.location.pathname);
    } else if (ig === 'error') {
      const reason = params.get('reason') ?? 'unknown';
      addToast(`Instagram connection failed: ${reason}`, 'error');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [refresh, addToast]);

  const ig = integrations.find((i) => i.provider === 'instagram');

  const connectInstagram = () => {
    window.location.href = `/api/integrations/instagram/connect?projectId=${projectId}&teamId=${teamId}`;
  };

  const disconnectInstagram = async () => {
    if (!confirm('Disconnect Instagram from this project?')) return;
    setDisconnecting(true);
    try {
      const res = await fetch('/api/integrations/instagram/disconnect', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId, teamId }),
      });
      if (!res.ok) throw new Error('Failed');
      addToast('Instagram disconnected', 'success');
      await refresh();
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Failed', 'error');
    } finally {
      setDisconnecting(false);
    }
  };

  if (loading) return null;

  return (
    <div
      className="glass-card"
      style={{ padding: 14, borderRadius: 12, marginBottom: 20 }}
    >
      <div
        className="recgon-label"
        style={{
          fontSize: '0.7rem',
          fontWeight: 700,
          letterSpacing: '0.12em',
          color: 'var(--txt-muted)',
          marginBottom: 10,
        }}
      >
        INTEGRATIONS
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>Instagram</span>
          {ig ? (
            <span style={{ fontSize: '0.78rem', color: '#10b981' }}>
              ● connected{ig.accountHandle ? ` as @${ig.accountHandle}` : ''}
            </span>
          ) : (
            <span style={{ fontSize: '0.78rem', color: 'var(--txt-muted)' }}>not connected</span>
          )}
        </div>
        {ig ? (
          <button
            onClick={disconnectInstagram}
            disabled={disconnecting}
            style={{
              padding: '4px 10px',
              fontSize: '0.78rem',
              background: 'transparent',
              color: 'var(--txt-muted)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-pill)',
              cursor: disconnecting ? 'wait' : 'pointer',
            }}
          >
            Disconnect
          </button>
        ) : (
          <button
            onClick={connectInstagram}
            style={{
              padding: '4px 10px',
              fontSize: '0.78rem',
              fontWeight: 600,
              background: 'var(--signature)',
              color: 'white',
              border: 'none',
              borderRadius: 'var(--r-pill)',
              cursor: 'pointer',
            }}
          >
            Connect Instagram
          </button>
        )}
      </div>
      <p style={{ margin: '8px 0 0', fontSize: '0.72rem', color: 'var(--txt-muted)' }}>
        Lets Recgon verify Reels and posts. Requires an Instagram Business Account linked to a Facebook Page you manage.
      </p>
    </div>
  );
}
