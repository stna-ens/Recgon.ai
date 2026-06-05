'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useSession } from 'next-auth/react';
import * as Tabs from '@radix-ui/react-tabs';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useTeam } from '@/components/TeamProvider';
import { useToast } from '@/components/Toast';
import RecgonAdminPanel from '@/components/recgon/RecgonAdminPanel';

type TeamTab = 'profile' | 'members' | 'invites' | 'dispatcher';
const TAB_VALUES: TeamTab[] = ['profile', 'members', 'invites', 'dispatcher'];

interface Team {
  id: string;
  name: string;
  slug?: string;
  description?: string;
  avatarColor?: string;
  avatarUrl?: string;
  createdAt?: string;
}

interface Member {
  userId: string;
  nickname: string | null;
  email: string | null;
  role: 'owner' | 'member' | 'viewer';
  joinedAt: string;
  avatarUrl?: string | null;
}

interface Invitation {
  id: string;
  email: string | null;
  role: 'owner' | 'member' | 'viewer';
  token: string;
  expiresAt: string;
  createdAt: string;
}

const AVATAR_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
  '#f97316', '#eab308', '#22c55e', '#06b6d4',
  '#3b82f6', '#0ea5e9', '#14b8a6', '#84cc16',
];

function defaultColor(name: string): string {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function initials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
}

type Translator = ReturnType<typeof useTranslations<'teams'>>;

function relTime(iso: string, t: Translator): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return t('admin.time.justNow');
  if (mins < 60) return t('admin.time.minutes', { count: mins });
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return t('admin.time.hours', { count: hrs });
  return t('admin.time.days', { count: Math.floor(hrs / 24) });
}

// Match v1: "Xh left" / "Xd left" until expiry.
function relativeExpiry(iso: string, t: Translator): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return t('admin.time.expired');
  const hours = Math.round(ms / 3_600_000);
  return hours < 24 ? t('admin.time.hoursLeft', { count: hours }) : t('admin.time.daysLeft', { count: Math.round(hours / 24) });
}

// Dominant-color extraction (parity with v1).
function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s: number;
  const l = (max + min) / 2;
  if (max === min) { h = 0; s = 0; }
  else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return { h, s, l };
}
function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  let r: number, g: number, b: number;
  if (s === 0) { r = g = b = l; }
  else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
}
function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('');
}
function extractDominantColor(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const SIZE = 48;
        const canvas = document.createElement('canvas');
        canvas.width = SIZE; canvas.height = SIZE;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, SIZE, SIZE);
        const data = ctx.getImageData(0, 0, SIZE, SIZE).data;
        const bins = new Map<string, { r: number; g: number; b: number; weight: number }>();
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
          if (a < 200) continue;
          const { h, s, l } = rgbToHsl(r, g, b);
          if (l > 0.92 || l < 0.08 || s < 0.18) continue;
          const hueBin = Math.floor((h * 12) % 12);
          const lightBin = l < 0.4 ? 0 : l < 0.7 ? 1 : 2;
          const key = `${hueBin}-${lightBin}`;
          const cur = bins.get(key) ?? { r: 0, g: 0, b: 0, weight: 0 };
          const w = s;
          cur.r += r * w; cur.g += g * w; cur.b += b * w; cur.weight += w;
          bins.set(key, cur);
        }
        if (bins.size === 0) return resolve(null);
        let best: { r: number; g: number; b: number; weight: number } | null = null;
        for (const v of bins.values()) { if (!best || v.weight > best.weight) best = v; }
        if (!best || best.weight === 0) return resolve(null);
        const r = Math.round(best.r / best.weight);
        const g = Math.round(best.g / best.weight);
        const b = Math.round(best.b / best.weight);
        const { h, s, l } = rgbToHsl(r, g, b);
        const adj = hslToRgb(h, Math.min(1, Math.max(s, 0.5)), Math.min(0.62, Math.max(l, 0.42)));
        resolve(rgbToHex(adj.r, adj.g, adj.b));
      } catch { resolve(null); }
      finally { URL.revokeObjectURL(url); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

export default function V2TeamAdminPage() {
  return (
    <Suspense fallback={null}>
      <V2TeamAdminPageInner />
    </Suspense>
  );
}

function V2TeamAdminPageInner() {
  const t = useTranslations('teams');
  const { data: session } = useSession();
  const { currentTeam, refreshTeams } = useTeam();
  const teamId = currentTeam?.id ?? null;
  const { addToast } = useToast();
  const router = useRouter();

  const [team, setTeam] = useState<Team | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);

  // Team avatar
  const [avatarUploading, setAvatarUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Name + description edit
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [nameSaving, setNameSaving] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState('');
  const [descSaving, setDescSaving] = useState(false);

  // Invite
  const [inviteRole, setInviteRole] = useState<'member' | 'viewer'>('member');
  const [generating, setGenerating] = useState(false);
  const [generatedLink, setGeneratedLink] = useState<string>('');

  // Role change loading per-user
  const [roleLoading, setRoleLoading] = useState<Record<string, boolean>>({});

  // Danger
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Inline-confirm strips (per-row) — match v1 pattern (no native confirm()).
  const [confirmRemoveUser, setConfirmRemoveUser] = useState<string | null>(null);
  const [confirmRevokeInvite, setConfirmRevokeInvite] = useState<string | null>(null);

  // Active tab — synced to URL ?tab=
  const searchParams = useSearchParams();
  const tabFromUrl = searchParams?.get('tab');
  const activeTab: TeamTab = useMemo(() => {
    return (TAB_VALUES as string[]).includes(tabFromUrl ?? '') ? (tabFromUrl as TeamTab) : 'profile';
  }, [tabFromUrl]);
  const setActiveTab = useCallback((next: string) => {
    const sp = new URLSearchParams(searchParams?.toString() ?? '');
    if (next === 'profile') sp.delete('tab'); else sp.set('tab', next);
    const qs = sp.toString();
    router.replace(qs ? `/team?${qs}` : '/team', { scroll: false });
  }, [router, searchParams]);

  const refresh = useCallback(async () => {
    if (!teamId) return;
    try {
      const [tr, mr, ir] = await Promise.all([
        fetch(`/api/teams/${teamId}`, { cache: 'no-store' }),
        fetch(`/api/teams/${teamId}/members`, { cache: 'no-store' }),
        fetch(`/api/teams/${teamId}/invitations`, { cache: 'no-store' }),
      ]);
      if (tr.ok) {
        const t = await tr.json();
        setTeam(t);
      }
      if (mr.ok) {
        const data = await mr.json();
        const list: Member[] = Array.isArray(data?.members) ? data.members : Array.isArray(data) ? data : [];
        setMembers(list);
      }
      if (ir.ok) {
        const data = await ir.json();
        const list: Invitation[] = Array.isArray(data) ? data : Array.isArray(data?.invitations) ? data.invitations : [];
        setInvites(list);
      }
    } catch { /* swallowed */ }
    setLoading(false);
  }, [teamId]);

  useEffect(() => { refresh(); }, [refresh]);

  const patchTeam = useCallback(async (body: Record<string, unknown>) => {
    if (!teamId) throw new Error('no team');
    const res = await fetch(`/api/teams/${teamId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j?.error || 'update failed');
    }
    return res.json();
  }, [teamId]);

  // Avatar upload
  const handleAvatarUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !teamId) return;
    e.target.value = '';
    setAvatarUploading(true);
    const colorPromise = extractDominantColor(file).catch(() => null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`/api/teams/${teamId}/avatar`, { method: 'POST', body: fd });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || 'avatar upload failed');
      }
      const d = await res.json();
      const dominantColor = await colorPromise;
      setTeam((p) => p ? { ...p, avatarUrl: d.avatarUrl, ...(dominantColor ? { avatarColor: dominantColor } : {}) } : p);
      if (dominantColor) {
        fetch(`/api/teams/${teamId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ avatarColor: dominantColor }),
        }).catch(() => {});
      }
      await refreshTeams?.();
      addToast(t('admin.toasts.avatarUpdated'), 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : t('admin.toasts.avatarFailed'), 'error');
    } finally {
      setAvatarUploading(false);
    }
  }, [teamId, refreshTeams, addToast, t]);

  const handlePickColor = useCallback(async (color: string) => {
    setTeam((p) => p ? { ...p, avatarColor: color } : p);
    try {
      await patchTeam({ avatarColor: color });
      await refreshTeams?.();
    } catch {
      addToast(t('admin.toasts.colorFailed'), 'error');
    }
  }, [patchTeam, refreshTeams, addToast, t]);

  const handleSaveName = useCallback(async () => {
    if (!team) return;
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === team.name) { setEditingName(false); return; }
    setNameSaving(true);
    try {
      await patchTeam({ name: trimmed });
      setTeam((p) => p ? { ...p, name: trimmed } : p);
      await refreshTeams?.();
      setEditingName(false);
      addToast(t('admin.toasts.renamed'), 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : t('admin.toasts.renameFailed'), 'error');
    } finally {
      setNameSaving(false);
    }
  }, [team, nameDraft, patchTeam, refreshTeams, addToast, t]);

  const handleSaveDesc = useCallback(async () => {
    if (!team) return;
    const trimmed = descDraft.trim();
    if (trimmed === (team.description ?? '')) { setEditingDesc(false); return; }
    setDescSaving(true);
    try {
      await patchTeam({ description: trimmed });
      setTeam((p) => p ? { ...p, description: trimmed || undefined } : p);
      setEditingDesc(false);
      addToast(t('admin.toasts.descSaved'), 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : t('admin.toasts.saveFailed'), 'error');
    } finally {
      setDescSaving(false);
    }
  }, [team, descDraft, patchTeam, addToast, t]);

  const handleGenerateInvite = useCallback(async () => {
    if (!teamId || generating) return;
    setGenerating(true);
    setGeneratedLink('');
    try {
      const res = await fetch(`/api/teams/${teamId}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: inviteRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'failed to generate');
      const link = `${window.location.origin}/teams/invite/${data.token}`;
      setGeneratedLink(link);
      try { await navigator.clipboard.writeText(link); addToast(t('admin.toasts.inviteCopied'), 'success'); }
      catch { addToast(t('admin.toasts.inviteGenerated'), 'info'); }
      await refresh();
    } catch (err) {
      addToast(err instanceof Error ? err.message : t('admin.toasts.failed'), 'error');
    } finally {
      setGenerating(false);
    }
  }, [teamId, generating, inviteRole, addToast, refresh, t]);

  const handleRevoke = useCallback(async (inviteId: string) => {
    if (!teamId) return;
    setConfirmRevokeInvite(null);
    try {
      const res = await fetch(`/api/teams/${teamId}/invitations`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteId }),
      });
      if (!res.ok) throw new Error('failed');
      setInvites((p) => p.filter((i) => i.id !== inviteId));
      addToast(t('admin.toasts.inviteRevoked'), 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : t('admin.toasts.failed'), 'error');
    }
  }, [teamId, addToast, t]);

  const handleRemoveMember = useCallback(async (userId: string) => {
    if (!teamId) return;
    setConfirmRemoveUser(null);
    try {
      const res = await fetch(`/api/teams/${teamId}/members`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) throw new Error('failed');
      setMembers((p) => p.filter((m) => m.userId !== userId));
      addToast(t('admin.toasts.memberRemoved'), 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : t('admin.toasts.failed'), 'error');
    }
  }, [teamId, addToast, t]);

  const handleRoleChange = useCallback(async (userId: string, newRole: 'owner' | 'member' | 'viewer') => {
    if (!teamId) return;
    setRoleLoading((p) => ({ ...p, [userId]: true }));
    try {
      const res = await fetch(`/api/teams/${teamId}/members/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || 'role change failed');
      }
      setMembers((p) => p.map((m) => m.userId === userId ? { ...m, role: newRole } : m));
      addToast(t('admin.toasts.roleUpdated'), 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : t('admin.toasts.failed'), 'error');
    } finally {
      setRoleLoading((p) => ({ ...p, [userId]: false }));
    }
  }, [teamId, addToast, t]);

  // Stronger leave-team warning copy: include the project-loss consequence.
  const handleLeaveTeam = useCallback(async () => {
    if (!teamId || !session?.user?.id) return;
    setConfirmLeave(false);
    try {
      const res = await fetch(`/api/teams/${teamId}/members`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: session.user.id }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || 'leave failed');
      }
      await refreshTeams?.();
      addToast(t('admin.toasts.leftTeam'), 'success');
      router.push('/projects');
    } catch (err) {
      addToast(err instanceof Error ? err.message : t('admin.toasts.failed'), 'error');
    }
  }, [teamId, session?.user?.id, refreshTeams, addToast, router, t]);

  const handleDeleteTeam = useCallback(async () => {
    if (!teamId || deleting) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/teams/${teamId}`, { method: 'DELETE' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || 'delete failed');
      }
      await refreshTeams?.();
      addToast(t('admin.toasts.teamDeleted'), 'success');
      router.push('/projects');
    } catch (err) {
      addToast(err instanceof Error ? err.message : t('admin.toasts.failed'), 'error');
      setDeleting(false);
    }
  }, [teamId, deleting, refreshTeams, addToast, router, t]);

  const handleCopyLink = (link: string) => {
    navigator.clipboard.writeText(link).then(
      () => addToast(t('admin.toasts.copied'), 'success'),
      () => addToast(t('admin.toasts.copyFailed'), 'error'),
    );
  };

  const myUserId = session?.user?.id;
  const myRole = members.find((m) => m.userId === myUserId)?.role;
  const isOwner = myRole === 'owner';
  const teamAvatarColor = team?.avatarColor ?? defaultColor(team?.name ?? 'Team');
  const teamInitials = initials(team?.name ?? 'Team');

  const teamShortId = team?.id ? team.id.replace(/-/g, '').slice(0, 8).toUpperCase() : '────────';
  const ownerCount = members.filter((m) => m.role === 'owner').length;
  const memberCount = members.filter((m) => m.role === 'member').length;
  const viewerCount = members.filter((m) => m.role === 'viewer').length;
  const foundedDate = team?.createdAt ? new Date(team.createdAt).toISOString().slice(0, 10) : null;

  return (
    <div className="rec-team">
      {/* HERO — always visible, editorial team identity */}
      <header className="rec-hero">
        <div className="rec-hero-stamp">
          <div
            className="rec-stamp-face"
            style={{ background: team?.avatarUrl ? 'transparent' : teamAvatarColor }}
          >
            {team?.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={team.avatarUrl} alt="" />
            ) : (
              <span className="rec-stamp-mono">{teamInitials}</span>
            )}
            <span className="rec-stamp-corner rec-stamp-corner-tl" aria-hidden />
            <span className="rec-stamp-corner rec-stamp-corner-tr" aria-hidden />
            <span className="rec-stamp-corner rec-stamp-corner-bl" aria-hidden />
            <span className="rec-stamp-corner rec-stamp-corner-br" aria-hidden />
          </div>
          <div className="rec-stamp-id">
            <span>{t('admin.hero.id')}</span>
            <code>{teamShortId}</code>
          </div>
        </div>

        <div className="rec-hero-title-wrap">
          <span className="rec-hero-eyebrow">{t('admin.hero.eyebrow')}</span>
          <h1 className="rec-hero-title">
            {team?.name ?? currentTeam?.name ?? t('admin.hero.teamFallback')}<span className="rec-hero-period">.</span>
          </h1>
          {team?.description && (
            <p className="rec-hero-desc">&ldquo;{team.description}&rdquo;</p>
          )}
          <dl className="rec-hero-meta">
            {team?.slug && (
              <div className="rec-meta-item">
                <dt>{t('admin.hero.slug')}</dt>
                <dd><code>/{team.slug}</code></dd>
              </div>
            )}
            <div className="rec-meta-item">
              <dt>{t('admin.hero.members')}</dt>
              <dd className="rec-meta-num">{loading ? '—' : members.length}</dd>
            </div>
            <div className="rec-meta-item">
              <dt>{t('admin.hero.pending')}</dt>
              <dd className="rec-meta-num">{loading ? '—' : invites.length}</dd>
            </div>
            {myRole && (
              <div className="rec-meta-item">
                <dt>{t('admin.hero.yourRole')}</dt>
                <dd className={`rec-meta-role is-${myRole}`}>{t(`roles.${myRole}`)}</dd>
              </div>
            )}
            {foundedDate && (
              <div className="rec-meta-item">
                <dt>{t('admin.hero.founded')}</dt>
                <dd className="rec-meta-date">{foundedDate}</dd>
              </div>
            )}
          </dl>
        </div>
      </header>

      <Tabs.Root value={activeTab} onValueChange={setActiveTab} className="rec-tabs">
        <Tabs.List className="rec-tablist" aria-label={t('admin.tabs.ariaLabel')}>
          <Tabs.Trigger value="profile" className="rec-tab">
            <span className="rec-tab-num">01</span>
            <span className="rec-tab-label">{t('admin.tabs.profile')}</span>
          </Tabs.Trigger>
          <Tabs.Trigger value="members" className="rec-tab">
            <span className="rec-tab-num">02</span>
            <span className="rec-tab-label">{t('admin.tabs.members')}</span>
          </Tabs.Trigger>
          <Tabs.Trigger value="invites" className="rec-tab">
            <span className="rec-tab-num">03</span>
            <span className="rec-tab-label">{t('admin.tabs.invites')}</span>
            {invites.length > 0 && <span className="rec-tab-count">{invites.length}</span>}
          </Tabs.Trigger>
          <Tabs.Trigger value="dispatcher" className="rec-tab">
            <span className="rec-tab-num">04</span>
            <span className="rec-tab-label">{t('admin.tabs.dispatch')}</span>
          </Tabs.Trigger>
        </Tabs.List>

        {/* PROFILE TAB — pure configuration */}
        <Tabs.Content value="profile" className="rec-panel">
          <section className="rec-block">
            <div className="rec-config-grid">
              <div className="rec-config-row">
                <div className="rec-config-label">
                  <span className="rec-config-key">{t('admin.config.name')}</span>
                  <span className="rec-config-hint">{t('admin.config.nameHint')}</span>
                </div>
                <div className="rec-config-value">
                  {editingName ? (
                    <div className="rec-edit-cluster">
                      <input
                        type="text"
                        value={nameDraft}
                        onChange={(e) => setNameDraft(e.target.value)}
                        className="rec-input"
                        autoFocus
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') setEditingName(false); }}
                      />
                      <button type="button" className="rec-btn-tiny" onClick={() => setEditingName(false)} disabled={nameSaving}>{t('admin.actions.cancel')}</button>
                      <button type="button" className="rec-btn-tiny is-primary" onClick={handleSaveName} disabled={nameSaving}>
                        {nameSaving ? <><span className="rec-spinner" /> {t('admin.actions.save')}</> : t('admin.actions.save')}
                      </button>
                    </div>
                  ) : (
                    <div className="rec-read-row">
                      <span className="rec-read-text">{team?.name ?? '—'}</span>
                      {isOwner && (
                        <button type="button" className="rec-btn-tiny" onClick={() => { setNameDraft(team?.name ?? ''); setEditingName(true); }}>{t('admin.actions.rename')}</button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="rec-config-row">
                <div className="rec-config-label">
                  <span className="rec-config-key">{t('admin.config.description')}</span>
                  <span className="rec-config-hint">{t('admin.config.descriptionHint')}</span>
                </div>
                <div className="rec-config-value">
                  {editingDesc ? (
                    <div className="rec-edit-cluster is-block">
                      <textarea
                        value={descDraft}
                        onChange={(e) => setDescDraft(e.target.value)}
                        rows={3}
                        maxLength={120}
                        className="rec-input is-textarea"
                        placeholder={t('admin.config.descriptionPlaceholder')}
                        autoFocus
                      />
                      <div className="rec-edit-foot">
                        <span className="rec-edit-count">{descDraft.length}/120</span>
                        <button type="button" className="rec-btn-tiny" onClick={() => setEditingDesc(false)} disabled={descSaving}>{t('admin.actions.cancel')}</button>
                        <button type="button" className="rec-btn-tiny is-primary" onClick={handleSaveDesc} disabled={descSaving}>
                          {descSaving ? <><span className="rec-spinner" /> {t('admin.actions.save')}</> : t('admin.actions.save')}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="rec-read-row">
                      {team?.description ? (
                        <span className="rec-read-text">{team.description}</span>
                      ) : (
                        <span className="rec-read-empty">{t('admin.config.noDescription')}</span>
                      )}
                      {isOwner && (
                        <button type="button" className="rec-btn-tiny" onClick={() => { setDescDraft(team?.description ?? ''); setEditingDesc(true); }}>
                          {team?.description ? t('admin.actions.edit') : t('admin.actions.add')}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="rec-config-row">
                <div className="rec-config-label">
                  <span className="rec-config-key">{t('admin.config.avatar')}</span>
                  <span className="rec-config-hint">{t('admin.config.avatarHint')}</span>
                </div>
                <div className="rec-config-value">
                  <div className="rec-avatar-cluster">
                    <button
                      type="button"
                      className="rec-avatar-thumb"
                      style={{ background: team?.avatarUrl ? 'transparent' : teamAvatarColor }}
                      onClick={() => fileInputRef.current?.click()}
                      disabled={avatarUploading || !isOwner}
                      aria-label={t('admin.config.changeAvatar')}
                    >
                      {avatarUploading ? (
                        <span className="rec-spinner is-light" />
                      ) : team?.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={team.avatarUrl} alt="" />
                      ) : (
                        <span>{teamInitials}</span>
                      )}
                    </button>
                    <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarUpload} disabled={avatarUploading} hidden />
                    {isOwner && (
                      <>
                        <button type="button" className="rec-btn-tiny" onClick={() => fileInputRef.current?.click()} disabled={avatarUploading}>{t('admin.config.uploadImage')}</button>
                        <div className="rec-color-row">
                          <span className="rec-color-row-label">{t('admin.config.color')}</span>
                          {AVATAR_COLORS.map((c) => (
                            <button
                              key={c}
                              type="button"
                              className={`rec-color-swatch ${teamAvatarColor === c ? 'is-active' : ''}`}
                              style={{ background: c }}
                              onClick={() => handlePickColor(c)}
                              aria-label={t('admin.config.pickColor', { color: c })}
                            />
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {team?.slug && (
                <div className="rec-config-row">
                  <div className="rec-config-label">
                    <span className="rec-config-key">{t('admin.config.slug')}</span>
                    <span className="rec-config-hint">{t('admin.config.slugHint')}</span>
                  </div>
                  <div className="rec-config-value">
                    <div className="rec-read-row">
                      <code className="rec-read-code">/{team.slug}</code>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="rec-block rec-danger">
            <header className="rec-block-head">
              <span className="rec-block-num is-danger">!!</span>
              <h2 className="rec-block-title is-danger">{t('admin.danger.title')}</h2>
              <p className="rec-block-sub">{t('admin.danger.subtitle')}</p>
            </header>

            {!isOwner && (
              <div className="rec-danger-row">
                <div>
                  <div className="rec-danger-title">{t('admin.danger.leaveTitle')}</div>
                  <p className="rec-danger-hint">{t('admin.danger.leaveHint')}</p>
                </div>
                {confirmLeave ? (
                  <div className="rec-confirm">
                    <span className="rec-confirm-text">{t('admin.danger.areYouSure')}</span>
                    <button type="button" className="rec-btn" onClick={() => setConfirmLeave(false)}>{t('admin.actions.cancel')}</button>
                    <button type="button" className="rec-btn is-danger" onClick={handleLeaveTeam}>{t('admin.danger.confirmLeave')}</button>
                  </div>
                ) : (
                  <button type="button" className="rec-btn is-danger-ghost" onClick={() => setConfirmLeave(true)}>{t('admin.danger.leaveButton')}</button>
                )}
              </div>
            )}

            {isOwner && (
              <div className="rec-danger-row">
                <div>
                  <div className="rec-danger-title">{t('admin.danger.deleteTitle')}</div>
                  <p className="rec-danger-hint">{t('admin.danger.deleteHint')}</p>
                </div>
                {confirmDelete ? (
                  <div className="rec-confirm">
                    <span className="rec-confirm-text">{t('admin.danger.areYouSure')}</span>
                    <button type="button" className="rec-btn" onClick={() => setConfirmDelete(false)} disabled={deleting}>{t('admin.actions.cancel')}</button>
                    <button type="button" className="rec-btn is-danger" onClick={handleDeleteTeam} disabled={deleting}>
                      {deleting ? <><span className="rec-spinner" /> {t('admin.danger.deleting')}</> : t('admin.danger.confirmDelete')}
                    </button>
                  </div>
                ) : (
                  <button type="button" className="rec-btn is-danger-ghost" onClick={() => setConfirmDelete(true)}>{t('admin.danger.deleteButton')}</button>
                )}
              </div>
            )}
          </section>
        </Tabs.Content>

        {/* MEMBERS TAB — indexed roster */}
        <Tabs.Content value="members" className="rec-panel">
          <section className="rec-block">
            <dl className="rec-stat-strip rec-stat-strip-bar">
              <div><dt>{t('admin.members.active')}</dt><dd>{loading ? '—' : members.length}</dd></div>
              <div><dt>{t('admin.members.owners')}</dt><dd>{loading ? '—' : ownerCount}</dd></div>
              <div><dt>{t('admin.members.members')}</dt><dd>{loading ? '—' : memberCount}</dd></div>
              <div><dt>{t('admin.members.viewers')}</dt><dd>{loading ? '—' : viewerCount}</dd></div>
            </dl>

            {loading ? (
              <div className="rec-roster">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="rec-roster-row is-skel">
                    <span className="rec-roster-num">{String(i).padStart(2, '0')}</span>
                    <span className="rec-roster-dot" />
                    <span className="rec-roster-skel-bar" />
                  </div>
                ))}
              </div>
            ) : members.length === 0 ? (
              <p className="rec-empty">{t('admin.members.noneLoaded')}</p>
            ) : (
              <div className="rec-roster">
                {members.map((m, idx) => {
                  const isMe = m.userId === myUserId;
                  const isLoading = roleLoading[m.userId];
                  const displayName = m.nickname || m.email?.split('@')[0] || t('admin.members.memberFallback');
                  const isConfirmingRemove = confirmRemoveUser === m.userId;
                  const canEdit = isOwner && !isMe;
                  const dotColor = defaultColor(m.nickname || m.email || '?');
                  return (
                    <div key={m.userId} className="rec-roster-row-wrap">
                      <div className={`rec-roster-row ${isMe ? 'is-me' : ''}`}>
                        <span className="rec-roster-num">{String(idx + 1).padStart(2, '0')}</span>
                        <span
                          className="rec-roster-dot"
                          style={{ background: m.avatarUrl ? 'transparent' : dotColor }}
                          title={isMe ? t('admin.members.youTitle', { name: displayName }) : displayName}
                        >
                          {m.avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={m.avatarUrl} alt="" />
                          ) : (
                            <span>{(m.nickname || m.email || '?').slice(0, 1).toUpperCase()}</span>
                          )}
                        </span>
                        <div className="rec-roster-id">
                          <span className="rec-roster-name">
                            {displayName}
                            {isMe && <span className="rec-you">{t('admin.members.you')}</span>}
                          </span>
                          {m.email && m.nickname && <span className="rec-roster-email">{m.email}</span>}
                        </div>
                        <span className="rec-roster-joined">{t('admin.members.joinedAgo', { time: relTime(m.joinedAt, t) })}</span>
                        {canEdit ? (
                          <DropdownMenu.Root>
                            <DropdownMenu.Trigger asChild>
                              <button
                                type="button"
                                className={`rec-role rec-role-trigger is-${m.role}`}
                                disabled={isLoading}
                                aria-label={t('admin.members.changeRole', { role: t(`roles.${m.role}`) })}
                              >
                                <span>{t(`roles.${m.role}`)}</span>
                                <span className="rec-role-chevron" aria-hidden>›</span>
                              </button>
                            </DropdownMenu.Trigger>
                            <DropdownMenu.Portal>
                              <DropdownMenu.Content className="rec-role-menu" sideOffset={6} align="end">
                                {(['owner', 'member', 'viewer'] as const).map((r) => (
                                  <DropdownMenu.Item
                                    key={r}
                                    className={`rec-role-menu-item ${m.role === r ? 'is-active' : ''}`}
                                    onSelect={() => { if (r !== m.role) handleRoleChange(m.userId, r); }}
                                  >
                                    <span>{t(`roles.${r}`)}</span>
                                    {m.role === r && <span aria-hidden>✓</span>}
                                  </DropdownMenu.Item>
                                ))}
                              </DropdownMenu.Content>
                            </DropdownMenu.Portal>
                          </DropdownMenu.Root>
                        ) : (
                          <span className={`rec-role is-${m.role}`}>{t(`roles.${m.role}`)}</span>
                        )}
                        {canEdit && members.length > 1 && !isConfirmingRemove ? (
                          <button
                            type="button"
                            className="rec-roster-remove"
                            onClick={() => setConfirmRemoveUser(m.userId)}
                            aria-label={t('admin.members.removeMember')}
                            title={t('admin.members.remove')}
                          >
                            ×
                          </button>
                        ) : (
                          <span className="rec-roster-remove-spacer" aria-hidden />
                        )}
                      </div>
                      {isConfirmingRemove && (
                        <div className="rec-confirm-strip">
                          <span className="rec-confirm-strip-text">{t.rich('admin.members.removeConfirm', { name: displayName, strong: (chunks) => <strong>{chunks}</strong> })}</span>
                          <button type="button" className="rec-btn is-danger" onClick={() => handleRemoveMember(m.userId)}>{t('admin.members.remove')}</button>
                          <button type="button" className="rec-btn" onClick={() => setConfirmRemoveUser(null)}>{t('admin.actions.cancel')}</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </Tabs.Content>

        {/* INVITES TAB — split: generator | pending */}
        <Tabs.Content value="invites" className="rec-panel">
          <section className="rec-block">
            <div className="rec-invite-split">
              <div className="rec-invite-form">
                <span className="rec-mini-label">{t('admin.invites.newLink')}</span>
                <div className="rec-invite-roles" role="group" aria-label={t('admin.invites.roleGroup')}>
                  {(['member', 'viewer'] as const).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setInviteRole(r)}
                      className={`rec-invite-role-btn ${inviteRole === r ? 'is-active' : ''}`}
                    >
                      {t(`roles.${r}`)}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="rec-btn is-primary is-block"
                  onClick={handleGenerateInvite}
                  disabled={generating || !isOwner}
                  title={isOwner ? undefined : t('admin.invites.ownerOnly')}
                >
                  {generating ? <><span className="rec-spinner is-light" /> {t('admin.invites.generating')}</> : t('admin.invites.generateLink')}
                </button>
                {generatedLink && (
                  <div className="rec-invite-result">
                    <span className="rec-mini-label">{t('admin.invites.justGenerated')}</span>
                    <code className="rec-invite-code">{generatedLink}</code>
                    <button type="button" className="rec-btn-tiny" onClick={() => handleCopyLink(generatedLink)}>{t('admin.invites.copy')}</button>
                  </div>
                )}
              </div>

              <div className="rec-invite-pending">
                <div className="rec-pending-head">
                  <span className="rec-mini-label">{t('admin.invites.pending')}</span>
                  <span className="rec-pending-count">{loading ? '—' : `${invites.length}`}</span>
                </div>
                {loading ? null : invites.length === 0 ? (
                  <p className="rec-empty is-tight">{t('admin.invites.noPending')}</p>
                ) : (
                  <ul className="rec-pending-list">
                    {invites.map((inv) => {
                      const link = typeof window !== 'undefined' ? `${window.location.origin}/teams/invite/${inv.token}` : '';
                      const isConfirmingRevoke = confirmRevokeInvite === inv.id;
                      return (
                        <li key={inv.id} className="rec-pending-item">
                          <div className="rec-pending-row">
                            <div className="rec-pending-info">
                              <div className="rec-pending-target">
                                {inv.email || <span className="rec-pending-link-only">{t('admin.invites.linkLabel', { token: inv.token.slice(0, 6) })}</span>}
                              </div>
                              <div className="rec-pending-meta">
                                <span className={`rec-role is-${inv.role}`}>{t(`roles.${inv.role}`)}</span>
                                <span>· {t('admin.invites.createdAgo', { time: relTime(inv.createdAt, t) })}</span>
                                <span className="rec-pending-expiry">· {relativeExpiry(inv.expiresAt, t)}</span>
                              </div>
                            </div>
                            <div className="rec-pending-actions">
                              <button type="button" className="rec-btn-tiny" onClick={() => handleCopyLink(link)}>{t('admin.invites.copy')}</button>
                              {!isConfirmingRevoke && (
                                <button type="button" className="rec-roster-remove is-static" onClick={() => setConfirmRevokeInvite(inv.id)} aria-label={t('admin.invites.revoke')}>×</button>
                              )}
                            </div>
                          </div>
                          {isConfirmingRevoke && (
                            <div className="rec-confirm-strip">
                              <span className="rec-confirm-strip-text">{t('admin.invites.revokeConfirm')}</span>
                              <button type="button" className="rec-btn is-danger" onClick={() => handleRevoke(inv.id)}>{t('admin.invites.revoke')}</button>
                              <button type="button" className="rec-btn" onClick={() => setConfirmRevokeInvite(null)}>{t('admin.actions.cancel')}</button>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </section>
        </Tabs.Content>

        {/* DISPATCHER TAB */}
        <Tabs.Content value="dispatcher" className="rec-panel">
          {teamId ? (
            <div className="rec-dispatcher">
              <RecgonAdminPanel teamId={teamId} />
            </div>
          ) : (
            <p className="rec-empty">{t('admin.noTeamSelected')}</p>
          )}
        </Tabs.Content>
      </Tabs.Root>

      <style>{`
        /* ============================================================
           TEAM ADMIN — EDITORIAL CONSOLE
           Aesthetic: printer-shop precision · dense data console.
           Tokens: --signature, --rule, --txt-pure/muted/faint, --danger.
           Type: JetBrains Mono for editorial moments + body inherit.
           ============================================================ */

        .rec-team {
          display: flex;
          flex-direction: column;
          gap: 36px;
          padding-bottom: 80px;
          animation: recPageIn 600ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
        }
        @keyframes recPageIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: none; }
        }

        /* ───── HERO ───── */
        .rec-hero {
          position: relative;
          display: grid;
          grid-template-columns: auto 1fr;
          gap: 40px;
          align-items: center;
          padding: 28px 0 36px;
          border-bottom: 1px solid var(--rule);
        }
        .rec-hero::before {
          content: '';
          position: absolute;
          inset: -20px -40px 0 -40px;
          background:
            radial-gradient(60% 80% at 8% 60%, rgba(var(--signature-rgb), 0.10), transparent 70%),
            linear-gradient(180deg, transparent, rgba(var(--signature-rgb), 0.02));
          pointer-events: none;
          z-index: -1;
          mask-image: linear-gradient(180deg, black, black 80%, transparent);
          -webkit-mask-image: linear-gradient(180deg, black, black 80%, transparent);
        }

        .rec-hero-stamp {
          flex-shrink: 0;
          align-self: start;
        }
        .rec-stamp-face {
          position: relative;
          width: 116px;
          height: 116px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 30px;
          font-weight: 700;
          letter-spacing: 0.06em;
          color: white;
          border-radius: 4px;
          overflow: hidden;
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.20),
            inset 0 -22px 30px rgba(0,0,0,0.22),
            0 0 0 1px rgba(255,255,255,0.08),
            0 22px 36px -16px rgba(0,0,0,0.5);
        }
        .rec-stamp-face img { width: 100%; height: 100%; object-fit: cover; }
        .rec-stamp-mono { transform: translateY(1px); }
        .rec-stamp-corner {
          position: absolute;
          width: 9px; height: 9px;
          border: 1px solid rgba(255,255,255,0.55);
          pointer-events: none;
        }
        .rec-stamp-corner-tl { top: 6px; left: 6px; border-right: none; border-bottom: none; }
        .rec-stamp-corner-tr { top: 6px; right: 6px; border-left: none; border-bottom: none; }
        .rec-stamp-corner-bl { bottom: 6px; left: 6px; border-right: none; border-top: none; }
        .rec-stamp-corner-br { bottom: 6px; right: 6px; border-left: none; border-top: none; }

        .rec-stamp-id {
          margin-top: 12px;
          width: 116px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 9.5px;
          font-weight: 600;
          letter-spacing: 0.5px;
          text-transform: uppercase;
        }
        .rec-stamp-id span:first-child { color: var(--txt-faint); opacity: 0.65; }
        .rec-stamp-id code { color: var(--txt-muted); font-size: 10px; }

        .rec-hero-title-wrap {
          display: flex;
          flex-direction: column;
          gap: 10px;
          min-width: 0;
        }
        .rec-hero-eyebrow {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 10.5px;
          font-weight: 700;
          letter-spacing: 0.7px;
          text-transform: uppercase;
          color: var(--signature);
        }
        .rec-hero-title {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: clamp(40px, 7.2vw, 84px);
          font-weight: 700;
          line-height: 0.94;
          letter-spacing: -0.045em;
          color: var(--txt-pure);
          margin: 4px 0 6px;
          word-break: break-word;
          text-transform: lowercase;
        }
        .rec-hero-period { color: var(--signature); }
        .rec-hero-desc {
          font-size: 15px;
          color: var(--txt-muted);
          line-height: 1.5;
          margin: 0 0 6px;
          max-width: 56ch;
          font-style: italic;
          letter-spacing: -0.005em;
        }
        .rec-hero-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 22px 28px;
          margin: 6px 0 0;
        }
        .rec-meta-item { display: flex; flex-direction: column; gap: 3px; margin: 0; }
        .rec-meta-item dt {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 9.5px;
          font-weight: 700;
          letter-spacing: 0.6px;
          text-transform: uppercase;
          color: var(--txt-faint);
        }
        .rec-meta-item dd {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 13px;
          font-weight: 600;
          color: var(--txt-pure);
          margin: 0;
          letter-spacing: 0.2px;
        }
        .rec-meta-item dd code { font-family: inherit; }
        .rec-meta-num { font-variant-numeric: tabular-nums; }
        .rec-meta-role.is-owner { color: var(--signature); }
        .rec-meta-role.is-member { color: var(--txt-muted); }
        .rec-meta-role.is-viewer { color: var(--txt-faint); }
        .rec-meta-date { color: var(--txt-muted) !important; font-weight: 500 !important; }

        /* ───── TABS ───── */
        .rec-tabs {
          display: flex;
          flex-direction: column;
          gap: 0;
        }
        .rec-tablist {
          display: flex;
          align-items: stretch;
          border-bottom: 1px solid var(--rule);
          margin: 0;
          overflow-x: auto;
          scrollbar-width: none;
        }
        .rec-tablist::-webkit-scrollbar { display: none; }
        .rec-tab {
          position: relative;
          display: inline-flex;
          align-items: baseline;
          gap: 10px;
          padding: 11px 20px;
          background: transparent;
          border: none;
          border-right: 1px solid var(--rule);
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          cursor: pointer;
          transition: background 220ms ease;
          white-space: nowrap;
          flex-shrink: 0;
        }
        .rec-tab:first-child { border-left: 1px solid var(--rule); }
        .rec-tab-num {
          font-size: 10.5px;
          font-weight: 700;
          letter-spacing: 0.5px;
          color: var(--txt-faint);
          font-variant-numeric: tabular-nums;
          transition: color 200ms ease;
        }
        .rec-tab-label {
          font-size: 12.5px;
          font-weight: 500;
          letter-spacing: 0.2px;
          color: var(--txt-muted);
          transition: color 200ms ease;
          text-transform: lowercase;
        }
        .rec-tab-count {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 16px;
          height: 16px;
          padding: 0 5px;
          border-radius: 3px;
          font-size: 9.5px;
          font-weight: 700;
          background: var(--signature);
          color: white;
          font-variant-numeric: tabular-nums;
          margin-left: 4px;
          letter-spacing: 0;
        }
        .rec-tab:hover .rec-tab-label { color: var(--txt-pure); }
        .rec-tab[data-state="active"] {
          background: linear-gradient(180deg, transparent, rgba(var(--signature-rgb), 0.05));
        }
        .rec-tab[data-state="active"] .rec-tab-num { color: var(--signature); }
        .rec-tab[data-state="active"] .rec-tab-label { color: var(--txt-pure); font-weight: 600; }
        .rec-tab[data-state="active"]::after {
          content: '';
          position: absolute;
          left: 0; right: 0; bottom: -1px;
          height: 2px;
          background: var(--signature);
          box-shadow: 0 0 14px rgba(var(--signature-rgb), 0.5);
        }
        .rec-panel {
          display: flex;
          flex-direction: column;
          gap: 36px;
          padding-top: 14px;
          animation: recPanelIn 220ms ease both;
        }
        .rec-panel[data-state="inactive"],
        .rec-panel[hidden] { display: none !important; }
        @keyframes recPanelIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }

        /* ───── BLOCKS ───── */
        .rec-block { display: flex; flex-direction: column; gap: 18px; }
        .rec-block-head {
          display: flex;
          align-items: baseline;
          gap: 14px;
          flex-wrap: wrap;
          padding-bottom: 14px;
          border-bottom: 1px solid var(--rule);
        }
        .rec-block-head-row { justify-content: space-between; }
        .rec-block-head-left {
          display: flex;
          align-items: baseline;
          gap: 14px;
        }
        .rec-block-num {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.6px;
          color: var(--signature);
          font-variant-numeric: tabular-nums;
          padding: 3px 8px;
          border: 1px solid rgba(var(--signature-rgb), 0.30);
          border-radius: 3px;
          background: rgba(var(--signature-rgb), 0.06);
        }
        .rec-block-num.is-danger {
          color: var(--danger);
          border-color: rgba(248, 113, 113, 0.30);
          background: rgba(248, 113, 113, 0.06);
        }
        .rec-block-title {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 16px;
          font-weight: 600;
          letter-spacing: -0.01em;
          color: var(--txt-pure);
          margin: 0;
          text-transform: lowercase;
        }
        .rec-block-title.is-danger { color: var(--danger); }
        .rec-block-sub {
          font-size: 12.5px;
          color: var(--txt-faint);
          margin: 0;
          letter-spacing: 0.05px;
        }

        .rec-stat-strip {
          display: flex;
          gap: 26px;
          margin: 0;
          flex-wrap: wrap;
        }
        .rec-stat-strip-bar {
          padding-bottom: 14px;
          border-bottom: 1px solid var(--rule);
        }
        .rec-stat-strip > div { display: flex; align-items: baseline; gap: 7px; }
        .rec-stat-strip dt {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.5px;
          text-transform: uppercase;
          color: var(--txt-faint);
          margin: 0;
        }
        .rec-stat-strip dd {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 14px;
          font-weight: 700;
          color: var(--txt-pure);
          font-variant-numeric: tabular-nums;
          margin: 0;
        }

        /* ───── CONFIG GRID ───── */
        .rec-config-grid { display: flex; flex-direction: column; }
        .rec-config-row {
          display: grid;
          grid-template-columns: 220px 1fr;
          gap: 32px;
          padding: 22px 0;
          border-bottom: 1px solid var(--rule);
          align-items: start;
        }
        .rec-config-row:last-child { border-bottom: none; }
        .rec-config-label { display: flex; flex-direction: column; gap: 5px; }
        .rec-config-key {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.6px;
          text-transform: uppercase;
          color: var(--txt-pure);
        }
        .rec-config-hint {
          font-size: 12.5px;
          color: var(--txt-faint);
          line-height: 1.5;
          letter-spacing: -0.005em;
        }
        .rec-config-value { min-width: 0; }
        .rec-read-row {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }
        .rec-read-text {
          font-size: 14.5px;
          color: var(--txt-pure);
          font-weight: 500;
          letter-spacing: -0.005em;
        }
        .rec-read-empty {
          font-size: 13.5px;
          color: var(--txt-faint);
          font-style: italic;
        }
        .rec-read-code {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 12.5px;
          font-weight: 600;
          color: var(--txt-muted);
          padding: 4px 9px;
          border: 1px solid var(--rule);
          border-radius: 3px;
          background: rgba(0,0,0,0.04);
          letter-spacing: 0.2px;
        }

        .rec-edit-cluster {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .rec-edit-cluster.is-block {
          flex-direction: column;
          align-items: stretch;
          gap: 10px;
        }
        .rec-edit-foot {
          display: flex;
          align-items: center;
          gap: 8px;
          justify-content: flex-end;
        }
        .rec-edit-count {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 10px;
          color: var(--txt-faint);
          letter-spacing: 0.3px;
          margin-right: auto;
          font-variant-numeric: tabular-nums;
        }

        .rec-input {
          flex: 1;
          min-width: 0;
          padding: 9px 12px;
          background: rgba(255,255,255,0.02);
          border: 1px solid var(--rule);
          border-radius: 3px;
          color: var(--txt-pure);
          font-family: inherit;
          font-size: 14.5px;
          outline: none;
          transition: border-color 180ms ease, box-shadow 180ms ease;
          letter-spacing: -0.005em;
        }
        .rec-input:focus {
          border-color: var(--signature);
          box-shadow: 0 0 0 3px rgba(var(--signature-rgb), 0.15);
        }
        .rec-input.is-textarea {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 12.5px;
          line-height: 1.55;
          resize: vertical;
          width: 100%;
          letter-spacing: 0.1px;
        }

        .rec-avatar-cluster {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }
        .rec-avatar-thumb {
          width: 44px; height: 44px;
          border-radius: 4px;
          overflow: hidden;
          border: 1px solid rgba(255,255,255,0.10);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 14px;
          font-weight: 700;
          color: white;
          padding: 0;
          flex-shrink: 0;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.15), inset 0 -8px 12px rgba(0,0,0,0.18);
        }
        .rec-avatar-thumb img { width: 100%; height: 100%; object-fit: cover; }
        .rec-color-row {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-left: 4px;
          padding-left: 12px;
          border-left: 1px solid var(--rule);
        }
        .rec-color-row-label {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 9.5px;
          font-weight: 700;
          letter-spacing: 0.6px;
          text-transform: uppercase;
          color: var(--txt-faint);
          margin-right: 4px;
        }
        .rec-color-swatch {
          width: 18px; height: 18px;
          border-radius: 3px;
          border: 1px solid rgba(0,0,0,0.10);
          cursor: pointer;
          padding: 0;
          transition: transform 180ms ease, box-shadow 180ms ease;
        }
        .rec-color-swatch:hover { transform: scale(1.18); }
        .rec-color-swatch.is-active {
          box-shadow: 0 0 0 2px var(--bg-deep, #0a0a0c), 0 0 0 3.5px var(--signature);
        }

        /* ───── BUTTONS ───── */
        .rec-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 9px 16px;
          background: transparent;
          border: 1px solid var(--rule);
          border-radius: 3px;
          color: var(--txt-muted);
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 11.5px;
          font-weight: 600;
          letter-spacing: 0.4px;
          text-transform: lowercase;
          cursor: pointer;
          transition: color 180ms ease, border-color 180ms ease, background 180ms ease, transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 180ms ease;
          white-space: nowrap;
        }
        .rec-btn:hover:not(:disabled) {
          color: var(--txt-pure);
          border-color: var(--rule-strong, var(--rule));
        }
        .rec-btn:disabled { opacity: 0.45; cursor: not-allowed; }
        .rec-btn.is-primary {
          background: var(--signature);
          border-color: var(--signature);
          color: white;
        }
        .rec-btn.is-primary:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 10px 22px -8px rgba(var(--signature-rgb), 0.55);
        }
        .rec-btn.is-danger {
          background: var(--danger);
          border-color: var(--danger);
          color: white;
        }
        .rec-btn.is-danger:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 10px 22px -8px rgba(248, 113, 113, 0.5);
        }
        .rec-btn.is-danger-ghost {
          background: transparent;
          border-color: rgba(248, 113, 113, 0.40);
          color: var(--danger);
        }
        .rec-btn.is-danger-ghost:hover:not(:disabled) {
          background: rgba(248, 113, 113, 0.08);
        }
        .rec-btn.is-block { display: flex; width: 100%; padding: 11px 16px; }

        .rec-btn-tiny {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 5px 10px;
          background: transparent;
          border: 1px solid var(--rule);
          border-radius: 3px;
          color: var(--txt-muted);
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 10.5px;
          font-weight: 600;
          letter-spacing: 0.4px;
          text-transform: lowercase;
          cursor: pointer;
          transition: color 180ms ease, border-color 180ms ease, background 180ms ease;
          flex-shrink: 0;
        }
        .rec-btn-tiny:hover:not(:disabled) {
          color: var(--signature);
          border-color: rgba(var(--signature-rgb), 0.45);
        }
        .rec-btn-tiny.is-primary {
          background: var(--signature);
          border-color: var(--signature);
          color: white;
        }
        .rec-btn-tiny.is-primary:hover:not(:disabled) {
          color: white;
          border-color: var(--signature);
          filter: brightness(1.06);
        }
        .rec-btn-tiny:disabled { opacity: 0.5; cursor: not-allowed; }

        .rec-spinner {
          width: 10px; height: 10px;
          border-radius: 50%;
          border: 1.5px solid currentColor;
          border-top-color: transparent;
          animation: recSpin 700ms linear infinite;
          opacity: 0.7;
          display: inline-block;
        }
        .rec-spinner.is-light { border-color: rgba(255,255,255,0.40); border-top-color: white; opacity: 1; }
        @keyframes recSpin { from { transform: rotate(0); } to { transform: rotate(360deg); } }

        /* ───── ROSTER ───── */
        .rec-roster {
          display: flex;
          flex-direction: column;
          margin-top: 4px;
        }
        .rec-roster-row-wrap { width: 100%; }
        .rec-roster-row {
          position: relative;
          display: grid;
          grid-template-columns: 28px 32px minmax(0, 1fr) auto auto auto;
          align-items: center;
          gap: 16px;
          padding: 14px 16px 14px 12px;
          border-bottom: 1px solid var(--rule);
          transition: background 200ms ease;
        }
        .rec-roster-row::before {
          content: '';
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 2px;
          background: var(--signature);
          opacity: 0;
          transition: opacity 180ms ease;
        }
        .rec-roster-row:hover { background: rgba(var(--signature-rgb), 0.025); }
        .rec-roster-row:hover::before { opacity: 1; }
        .rec-roster-row-wrap:last-child .rec-roster-row { border-bottom: none; }
        .rec-roster-row.is-me { background: rgba(var(--signature-rgb), 0.025); }
        .rec-roster-row.is-skel { pointer-events: none; }

        .rec-roster-num {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.4px;
          color: var(--txt-faint);
          font-variant-numeric: tabular-nums;
        }
        .rec-roster-dot {
          width: 30px;
          height: 30px;
          border-radius: 50%;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          border: 1px solid rgba(255,255,255,0.10);
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 11px;
          font-weight: 700;
          color: white;
          flex-shrink: 0;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -6px 10px rgba(0,0,0,0.18);
        }
        .rec-roster-dot img { width: 100%; height: 100%; object-fit: cover; }
        .rec-roster-id {
          display: flex;
          flex-direction: column;
          min-width: 0;
          gap: 1px;
        }
        .rec-roster-name {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
          font-weight: 600;
          color: var(--txt-pure);
          letter-spacing: -0.005em;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .rec-roster-email {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 10.5px;
          color: var(--txt-faint);
          letter-spacing: 0.2px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .rec-roster-joined {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 10.5px;
          color: var(--txt-faint);
          letter-spacing: 0.3px;
          white-space: nowrap;
        }
        .rec-you {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.6px;
          text-transform: uppercase;
          color: white;
          background: var(--signature);
          padding: 2px 6px;
          border-radius: 2px;
          line-height: 1.1;
        }

        .rec-roster-skel-bar {
          height: 12px;
          flex: 1;
          grid-column: 3 / -1;
          background: rgba(var(--signature-rgb), 0.06);
          animation: recSkel 1.6s ease-in-out infinite;
          border-radius: 2px;
        }
        @keyframes recSkel { 0%, 100% { opacity: 0.35; } 50% { opacity: 0.75; } }

        /* Roles */
        .rec-role {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 4px 10px;
          border-radius: 999px;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.6px;
          text-transform: uppercase;
          border: 1px solid;
          white-space: nowrap;
          line-height: 1.1;
        }
        .rec-role.is-owner {
          color: var(--signature);
          border-color: rgba(var(--signature-rgb), 0.32);
          background: rgba(var(--signature-rgb), 0.08);
        }
        .rec-role.is-member {
          color: var(--txt-muted);
          border-color: var(--rule);
          background: transparent;
        }
        .rec-role.is-viewer {
          color: var(--txt-faint);
          border-color: var(--rule);
          background: transparent;
        }
        .rec-role-trigger {
          cursor: pointer;
          transition: background 180ms ease, border-color 180ms ease;
        }
        .rec-role-trigger:hover:not(:disabled) {
          background: rgba(var(--signature-rgb), 0.10);
          border-color: rgba(var(--signature-rgb), 0.45);
        }
        .rec-role-trigger:disabled { opacity: 0.5; cursor: not-allowed; }
        .rec-role-chevron {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 11px;
          opacity: 0;
          transform: rotate(90deg);
          transition: opacity 160ms ease;
          margin-left: 2px;
        }
        .rec-roster-row:hover .rec-role-chevron,
        .rec-role-trigger[data-state="open"] .rec-role-chevron { opacity: 0.75; }

        .rec-role-menu {
          min-width: 160px;
          padding: 4px;
          background: color-mix(in oklab, var(--bg-deep, #0a0a0c) 95%, transparent);
          backdrop-filter: blur(20px) saturate(140%);
          -webkit-backdrop-filter: blur(20px) saturate(140%);
          border: 1px solid var(--rule);
          border-radius: 6px;
          box-shadow: 0 18px 40px -12px rgba(0,0,0,0.45);
          z-index: 50;
          animation: recMenuIn 160ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
        }
        @keyframes recMenuIn {
          from { opacity: 0; transform: translateY(-4px); }
          to   { opacity: 1; transform: none; }
        }
        .rec-role-menu-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 10px;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.4px;
          text-transform: lowercase;
          color: var(--txt-muted);
          cursor: pointer;
          border-radius: 4px;
          outline: none;
        }
        .rec-role-menu-item[data-highlighted] {
          background: rgba(var(--signature-rgb), 0.10);
          color: var(--txt-pure);
        }
        .rec-role-menu-item.is-active { color: var(--signature); }

        .rec-roster-remove {
          width: 26px;
          height: 26px;
          border-radius: 3px;
          background: transparent;
          border: 1px solid var(--rule);
          color: var(--txt-faint);
          font-size: 14px;
          line-height: 1;
          cursor: pointer;
          transition: color 180ms ease, border-color 180ms ease, opacity 160ms ease, background 180ms ease;
          opacity: 0;
        }
        .rec-roster-row:hover .rec-roster-remove,
        .rec-roster-remove:focus-visible,
        .rec-roster-remove.is-static { opacity: 1; }
        .rec-roster-remove:hover {
          color: var(--danger);
          border-color: rgba(248, 113, 113, 0.50);
          background: rgba(248, 113, 113, 0.06);
        }
        .rec-roster-remove-spacer {
          display: inline-block;
          width: 26px;
          height: 26px;
        }

        /* ───── EMPTY ───── */
        .rec-empty {
          font-size: 13.5px;
          color: var(--txt-faint);
          margin: 0;
          padding: 32px 0;
          text-align: center;
          font-style: italic;
        }
        .rec-empty.is-tight { padding: 16px 0; }

        /* ───── CONFIRM ───── */
        .rec-confirm-strip {
          margin: 0 0 0 0;
          padding: 12px 14px 12px 60px;
          background: rgba(248, 113, 113, 0.05);
          border-top: 1px solid rgba(248, 113, 113, 0.20);
          border-bottom: 1px solid rgba(248, 113, 113, 0.20);
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
          animation: recPanelIn 200ms ease;
        }
        .rec-confirm-strip-text {
          flex: 1;
          font-size: 13px;
          color: var(--txt-pure);
        }
        .rec-confirm {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }
        .rec-confirm-text {
          font-size: 13.5px;
          color: var(--txt-pure);
          font-weight: 600;
          margin-right: 4px;
        }

        /* ───── DANGER ZONE ───── */
        .rec-danger { gap: 14px; }
        .rec-danger-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 16px 18px;
          border: 1px dashed rgba(248, 113, 113, 0.32);
          border-radius: 4px;
          background:
            linear-gradient(180deg, rgba(248, 113, 113, 0.03), rgba(248, 113, 113, 0.01));
          flex-wrap: wrap;
        }
        .rec-danger-title {
          font-size: 13.5px;
          font-weight: 600;
          color: var(--txt-pure);
          letter-spacing: -0.005em;
          margin-bottom: 4px;
        }
        .rec-danger-hint {
          font-size: 12.5px;
          color: var(--txt-muted);
          margin: 0;
          line-height: 1.5;
          max-width: 480px;
          letter-spacing: -0.005em;
        }

        /* ───── INVITES ───── */
        .rec-invite-split {
          display: grid;
          grid-template-columns: 320px 1fr;
          gap: 36px;
          align-items: start;
        }
        .rec-mini-label {
          display: block;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 9.5px;
          font-weight: 700;
          letter-spacing: 0.7px;
          text-transform: uppercase;
          color: var(--txt-faint);
          margin-bottom: 10px;
        }
        .rec-invite-form {
          display: flex;
          flex-direction: column;
          gap: 14px;
          padding: 20px;
          border: 1px solid var(--rule);
          border-radius: 4px;
          background:
            linear-gradient(180deg, rgba(var(--signature-rgb), 0.025), transparent 60%),
            rgba(255,255,255,0.01);
          position: relative;
        }
        .rec-invite-form::before {
          content: '';
          position: absolute;
          left: -1px; top: -1px;
          width: 8px; height: 8px;
          border-top: 1px solid var(--signature);
          border-left: 1px solid var(--signature);
          opacity: 0.6;
        }
        .rec-invite-form::after {
          content: '';
          position: absolute;
          right: -1px; bottom: -1px;
          width: 8px; height: 8px;
          border-bottom: 1px solid var(--signature);
          border-right: 1px solid var(--signature);
          opacity: 0.6;
        }
        .rec-invite-roles {
          display: flex;
          gap: 0;
          border: 1px solid var(--rule);
          border-radius: 3px;
          overflow: hidden;
        }
        .rec-invite-role-btn {
          flex: 1;
          padding: 10px 14px;
          background: transparent;
          border: none;
          border-right: 1px solid var(--rule);
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.4px;
          text-transform: lowercase;
          color: var(--txt-faint);
          cursor: pointer;
          transition: color 180ms ease, background 180ms ease;
        }
        .rec-invite-role-btn:last-child { border-right: none; }
        .rec-invite-role-btn:hover { color: var(--txt-muted); background: rgba(255,255,255,0.02); }
        .rec-invite-role-btn.is-active {
          color: var(--signature);
          background: rgba(var(--signature-rgb), 0.08);
        }
        .rec-invite-result {
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding: 12px 14px;
          background: rgba(var(--signature-rgb), 0.05);
          border: 1px solid rgba(var(--signature-rgb), 0.22);
          border-radius: 4px;
          margin-top: 4px;
        }
        .rec-invite-result .rec-mini-label { color: var(--signature); margin-bottom: 0; }
        .rec-invite-code {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 11px;
          color: var(--txt-pure);
          background: transparent;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          letter-spacing: 0.1px;
        }

        .rec-invite-pending { min-width: 0; }
        .rec-pending-head {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          margin-bottom: 4px;
          padding-bottom: 10px;
          border-bottom: 1px solid var(--rule);
        }
        .rec-pending-head .rec-mini-label { margin-bottom: 0; }
        .rec-pending-count {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 10.5px;
          font-weight: 700;
          color: var(--txt-faint);
          font-variant-numeric: tabular-nums;
        }
        .rec-pending-list { list-style: none; padding: 0; margin: 0; }
        .rec-pending-item {
          border-bottom: 1px solid var(--rule);
          transition: background 200ms ease;
        }
        .rec-pending-item:hover { background: rgba(var(--signature-rgb), 0.02); }
        .rec-pending-item:last-child { border-bottom: none; }
        .rec-pending-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          align-items: center;
          gap: 14px;
          padding: 14px 8px;
        }
        .rec-pending-info { min-width: 0; }
        .rec-pending-target {
          font-size: 13.5px;
          font-weight: 600;
          color: var(--txt-pure);
          letter-spacing: -0.005em;
          margin-bottom: 4px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .rec-pending-link-only {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 12px;
          font-weight: 500;
          color: var(--txt-muted);
          letter-spacing: 0.3px;
        }
        .rec-pending-meta {
          display: flex;
          align-items: center;
          gap: 6px;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 10.5px;
          color: var(--txt-faint);
          letter-spacing: 0.2px;
          flex-wrap: wrap;
        }
        .rec-pending-expiry { color: var(--warning, #f59e0b); }
        .rec-pending-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        /* ───── DISPATCHER ───── */
        .rec-dispatcher {
          width: 100%;
          padding: 4px 0;
        }

        /* ───── RESPONSIVE ───── */
        @media (max-width: 880px) {
          .rec-team { gap: 28px; }
          .rec-hero {
            grid-template-columns: 1fr;
            gap: 24px;
            padding-top: 16px;
          }
          .rec-hero-stamp { justify-self: start; }
          .rec-hero-meta { gap: 16px 22px; }
          .rec-config-row {
            grid-template-columns: 1fr;
            gap: 10px;
            padding: 18px 0;
          }
          .rec-invite-split {
            grid-template-columns: 1fr;
            gap: 28px;
          }
          .rec-roster-row {
            grid-template-columns: 24px 28px minmax(0, 1fr) auto auto;
            gap: 12px;
            padding: 12px 12px 12px 8px;
          }
          .rec-roster-joined { display: none; }
          .rec-stat-strip { gap: 16px; }
          .rec-block-head-row { gap: 12px; }
        }
        @media (max-width: 540px) {
          .rec-hero-title { font-size: clamp(36px, 11vw, 56px); }
          .rec-stamp-face { width: 92px; height: 92px; font-size: 26px; }
          .rec-stamp-id { width: 92px; }
          .rec-tab { padding: 12px 14px; gap: 8px; }
          .rec-tab-num { font-size: 9.5px; }
          .rec-tab-label { font-size: 11.5px; }
          .rec-config-row { padding: 16px 0; }
          .rec-roster-row { grid-template-columns: 22px 26px minmax(0, 1fr) auto; }
          .rec-roster-row .rec-roster-remove,
          .rec-roster-row .rec-roster-remove-spacer { display: none; }
        }

      `}</style>
    </div>
  );
}
