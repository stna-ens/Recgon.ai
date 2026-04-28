'use client';

import { useEffect, useRef, useState, use, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useTeam } from '@/components/TeamProvider';
import { useToast } from '@/components/Toast';
import RecgonAdminPanel from '@/components/recgon/RecgonAdminPanel';

interface Member {
  teamId: string;
  userId: string;
  role: string;
  joinedAt: string;
  nickname?: string;
  email?: string;
  avatarUrl?: string;
}

interface PendingInvite {
  id: string;
  email: string | null;
  role: string;
  expiresAt: string;
  createdAt?: string;
}

interface TeamDetail {
  id: string;
  name: string;
  slug: string;
  description?: string;
  avatarColor?: string;
  avatarUrl?: string;
  createdBy: string;
  createdAt: string;
  role: string;
}

type ConfirmState =
  | { type: 'remove'; userId: string }
  | { type: 'revoke'; inviteId: string }
  | { type: 'delete' }
  | { type: 'leave' }
  | null;

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

function relativeExpiry(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  const hours = Math.round(ms / 3_600_000);
  return hours < 24 ? `${hours}h left` : `${Math.round(hours / 24)}d left`;
}

// ── Dominant-color extraction ────────────────────────────────────────────────
// Loads an image file into a small canvas, samples pixels, buckets them into
// HSL bins (skipping near-white/near-black/low-saturation), and returns the
// most populous bin as a hex color. Pure client-side, no deps.
function extractDominantColor(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const SIZE = 48; // tiny canvas — plenty for a dominant-color read
        const canvas = document.createElement('canvas');
        canvas.width = SIZE;
        canvas.height = SIZE;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, SIZE, SIZE);
        const data = ctx.getImageData(0, 0, SIZE, SIZE).data;

        // Bin by hue (12 buckets) × lightness (3 buckets), weighted by saturation.
        const bins = new Map<string, { r: number; g: number; b: number; weight: number }>();
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
          if (a < 200) continue;
          const { h, s, l } = rgbToHsl(r, g, b);
          // Skip near-white, near-black, or washed-out pixels.
          if (l > 0.92 || l < 0.08 || s < 0.18) continue;
          const hueBin = Math.floor((h * 12) % 12);
          const lightBin = l < 0.4 ? 0 : l < 0.7 ? 1 : 2;
          const key = `${hueBin}-${lightBin}`;
          const cur = bins.get(key) ?? { r: 0, g: 0, b: 0, weight: 0 };
          const w = s; // saturation = vividness, weight populous + vivid bins higher
          cur.r += r * w;
          cur.g += g * w;
          cur.b += b * w;
          cur.weight += w;
          bins.set(key, cur);
        }

        if (bins.size === 0) return resolve(null);
        // Pick the bin with the highest accumulated weight.
        let best: { r: number; g: number; b: number; weight: number } | null = null;
        for (const v of bins.values()) {
          if (!best || v.weight > best.weight) best = v;
        }
        if (!best || best.weight === 0) return resolve(null);
        const r = Math.round(best.r / best.weight);
        const g = Math.round(best.g / best.weight);
        const b = Math.round(best.b / best.weight);
        // Nudge mid-light colors toward more vivid territory so they read well as accents.
        const { h, s, l } = rgbToHsl(r, g, b);
        const adjusted = hslToRgb(h, Math.min(1, Math.max(s, 0.5)), Math.min(0.62, Math.max(l, 0.42)));
        resolve(rgbToHex(adjusted.r, adjusted.g, adjusted.b));
      } catch {
        resolve(null);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  switch (max) {
    case r: h = (g - b) / d + (g < b ? 6 : 0); break;
    case g: h = (b - r) / d + 2; break;
    case b: h = (r - g) / d + 4; break;
  }
  return { h: h / 6, s, l };
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  if (s === 0) {
    const v = Math.round(l * 255);
    return { r: v, g: v, b: v };
  }
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
  return {
    r: Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    g: Math.round(hue2rgb(p, q, h) * 255),
    b: Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number) => n.toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

// ── Compact inline role dropdown ─────────────────────────────────────────────
function RoleDropdown({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const OPTS = [
    { value: 'owner',  label: 'Owner' },
    { value: 'member', label: 'Member' },
    { value: 'viewer', label: 'Viewer' },
  ];

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!triggerRef.current?.contains(e.target as Node) && !menuRef.current?.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleOpen = () => {
    if (disabled) return;
    setRect(triggerRef.current?.getBoundingClientRect() ?? null);
    setOpen((v) => !v);
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={handleOpen}
        disabled={disabled}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: '0.3rem 0.65rem',
          background: 'var(--btn-secondary-bg)',
          border: '1px solid var(--btn-secondary-border)',
          borderRadius: 8, cursor: disabled ? 'not-allowed' : 'pointer',
          color: 'var(--txt)', fontSize: '0.8rem', fontWeight: 500,
          fontFamily: 'inherit', opacity: disabled ? 0.5 : 1,
          transition: 'border-color 0.15s',
        }}
      >
        {OPTS.find((o) => o.value === value)?.label ?? value}
        <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"
          style={{ opacity: 0.4, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && rect && typeof document !== 'undefined' && createPortal(
        <div ref={menuRef} style={{
          position: 'fixed',
          top: rect.bottom + 4,
          left: rect.left,
          minWidth: rect.width,
          background: 'var(--glass-substrate)',
          backdropFilter: 'blur(40px) saturate(180%)',
          WebkitBackdropFilter: 'blur(40px) saturate(180%)',
          border: '1px solid var(--btn-secondary-border)',
          borderRadius: 10,
          boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
          zIndex: 99999, overflow: 'hidden',
        }}>
          {OPTS.map((opt) => (
            <button key={opt.value} type="button"
              onClick={() => { onChange(opt.value); setOpen(false); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                width: '100%', padding: '0.5rem 0.75rem',
                background: opt.value === value ? 'rgba(var(--signature-rgb), 0.08)' : 'transparent',
                border: 'none', cursor: 'pointer', textAlign: 'left',
                color: opt.value === value ? 'var(--signature)' : 'var(--txt)',
                fontSize: '0.82rem', fontWeight: opt.value === value ? 600 : 400,
                fontFamily: 'inherit',
              }}
            >
              {opt.value === value && (
                <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
              <span style={{ marginLeft: opt.value === value ? 0 : 19 }}>{opt.label}</span>
            </button>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}

// ── Member avatar ─────────────────────────────────────────────────────────────
function MemberAvatar({ member }: { member: Member }) {
  const name = member.nickname || member.email?.split('@')[0] || '?';
  const color = defaultColor(name);
  if (member.avatarUrl) {
    return (
      <img src={member.avatarUrl} alt={name}
        style={{ width: 36, height: 36, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} />
    );
  }
  return (
    <div style={{
      width: 36, height: 36, borderRadius: 10, background: color, flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 700, fontSize: '0.8rem', color: '#fff',
    }}>
      {initials(name)}
    </div>
  );
}

// ── Edit icon ─────────────────────────────────────────────────────────────────
function EditIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function TeamDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: session } = useSession();
  const { refreshTeams } = useTeam();
  const { addToast } = useToast();

  const [team, setTeam] = useState<TeamDetail | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);

  const [inviteRole, setInviteRole] = useState<'member' | 'viewer'>('member');
  const [inviteLink, setInviteLink] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const [roleChangeLoading, setRoleChangeLoading] = useState<Record<string, boolean>>({});
  const [pendingConfirm, setPendingConfirm] = useState<ConfirmState>(null);

  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [renameLoading, setRenameLoading] = useState(false);

  const [editingDesc, setEditingDesc] = useState(false);
  const [descValue, setDescValue] = useState('');
  const [descLoading, setDescLoading] = useState(false);

  const [showColorPicker, setShowColorPicker] = useState(false);
  const colorPickerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);

  // Close color picker on outside click
  useEffect(() => {
    if (!showColorPicker) return;
    const handler = (e: MouseEvent) => {
      if (!colorPickerRef.current?.contains(e.target as Node)) setShowColorPicker(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showColorPicker]);

  useEffect(() => {
    async function load() {
      try {
        const [teamRes, membersRes, invitesRes] = await Promise.all([
          fetch(`/api/teams/${id}`),
          fetch(`/api/teams/${id}/members`),
          fetch(`/api/teams/${id}/invitations`),
        ]);
        if (teamRes.ok) {
          const t = await teamRes.json();
          setTeam(t);
          setRenameValue(t.name);
          setDescValue(t.description ?? '');
        }
        if (membersRes.ok) setMembers(await membersRes.json());
        if (invitesRes.ok) setPendingInvites(await invitesRes.json());
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  async function patch(body: Record<string, unknown>) {
    return fetch(`/api/teams/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  const handleAvatarUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setAvatarUploading(true);

    // Kick off dominant-color extraction in parallel with the upload.
    const colorPromise = extractDominantColor(file).catch(() => null);

    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`/api/teams/${id}/avatar`, { method: 'POST', body: formData });
    if (res.ok) {
      const d = await res.json();
      const dominantColor = await colorPromise;
      setTeam((p) => p ? { ...p, avatarUrl: d.avatarUrl, ...(dominantColor ? { avatarColor: dominantColor } : {}) } : p);
      // Persist the derived color so other pages (sidebar, /teams list, etc.) get it too.
      if (dominantColor) {
        fetch(`/api/teams/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ avatarColor: dominantColor }),
        }).catch(() => {});
      }
      await refreshTeams();
      addToast('Avatar updated', 'success');
    } else {
      const d = await res.json();
      addToast(d.error || 'Failed to upload avatar', 'error');
    }
    setAvatarUploading(false);
  }, [id, refreshTeams, addToast]);

  async function handlePickColor(color: string) {
    setShowColorPicker(false);
    setTeam((p) => p ? { ...p, avatarColor: color } : p);
    const res = await patch({ avatarColor: color });
    if (!res.ok) { addToast('Failed to save color', 'error'); }
    else { await refreshTeams(); }
  }

  async function handleRename(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === team?.name) { setRenaming(false); return; }
    setRenameLoading(true);
    const res = await patch({ name: trimmed });
    if (res.ok) {
      setTeam((p) => p ? { ...p, name: trimmed } : p);
      await refreshTeams();
      addToast('Team renamed', 'success');
      setRenaming(false);
    } else {
      const d = await res.json();
      addToast(d.error || 'Failed to rename', 'error');
    }
    setRenameLoading(false);
  }

  async function handleSaveDescription(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = descValue.trim();
    if (trimmed === (team?.description ?? '')) { setEditingDesc(false); return; }
    setDescLoading(true);
    const res = await patch({ description: trimmed });
    if (res.ok) {
      setTeam((p) => p ? { ...p, description: trimmed || undefined } : p);
      addToast('Description saved', 'success');
      setEditingDesc(false);
    } else {
      const d = await res.json();
      addToast(d.error || 'Failed to save description', 'error');
    }
    setDescLoading(false);
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setActionLoading(true);
    setInviteLink('');
    try {
      const res = await fetch(`/api/teams/${id}/invite`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: inviteRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const link = `${window.location.origin}/teams/invite/${data.token}`;
      setInviteLink(link);
      const ir = await fetch(`/api/teams/${id}/invitations`);
      if (ir.ok) setPendingInvites(await ir.json());
      try { await navigator.clipboard.writeText(link); addToast('Invite link copied!', 'success'); }
      catch { addToast('Invite link generated — copy it below', 'info'); }
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Failed to generate invite', 'error');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRevokeInvite(inviteId: string) {
    setPendingConfirm(null);
    const res = await fetch(`/api/teams/${id}/invitations`, {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inviteId }),
    });
    if (res.ok) { setPendingInvites((p) => p.filter((i) => i.id !== inviteId)); addToast('Invitation revoked', 'success'); }
    else { const d = await res.json(); addToast(d.error || 'Failed to revoke', 'error'); }
  }

  async function handleRemoveMember(userId: string) {
    setPendingConfirm(null);
    const res = await fetch(`/api/teams/${id}/members`, {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    if (res.ok) { setMembers((p) => p.filter((m) => m.userId !== userId)); addToast('Member removed', 'success'); }
    else { const d = await res.json(); addToast(d.error || 'Failed to remove member', 'error'); }
  }

  async function handleLeaveTeam() {
    if (!session?.user?.id) return;
    setPendingConfirm(null);
    const res = await fetch(`/api/teams/${id}/members`, {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: session.user.id }),
    });
    if (res.ok) { await refreshTeams(); router.push('/teams'); }
    else { const d = await res.json(); addToast(d.error || 'Failed to leave team', 'error'); }
  }

  async function handleRoleChange(userId: string, newRole: string) {
    setRoleChangeLoading((p) => ({ ...p, [userId]: true }));
    const res = await fetch(`/api/teams/${id}/members/${userId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: newRole }),
    });
    if (res.ok) { setMembers((p) => p.map((m) => m.userId === userId ? { ...m, role: newRole } : m)); addToast('Role updated', 'success'); }
    else { const d = await res.json(); addToast(d.error || 'Failed to update role', 'error'); }
    setRoleChangeLoading((p) => ({ ...p, [userId]: false }));
  }

  async function handleDeleteTeam() {
    setPendingConfirm(null);
    const res = await fetch(`/api/teams/${id}`, { method: 'DELETE' });
    if (res.ok) { await refreshTeams(); router.push('/teams'); }
    else addToast('Failed to delete team', 'error');
  }

  if (loading) return (
    <div className="tdp-loading">
      <div className="tdp-loading-spinner" />
      <span>Loading team…</span>
      <style>{`
        .tdp-loading {
          display: flex; align-items: center; gap: 12px;
          padding: 48px 0; color: var(--txt-muted); font-size: 14px;
          font-family: 'JetBrains Mono', ui-monospace, monospace; letter-spacing: 0.5px;
        }
        .tdp-loading-spinner {
          width: 14px; height: 14px;
          border: 2px solid rgba(var(--signature-rgb), 0.18);
          border-top-color: var(--signature);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
  if (!team) return <p style={{ color: 'var(--danger)', padding: '2rem 0' }}>Team not found</p>;

  const isOwner = team.role === 'owner';
  const canInvite = isOwner || team.role === 'member';
  const avatarColor = team.avatarColor ?? defaultColor(team.name);
  const avatarUrl = team.avatarUrl;

  return (
    <div className="tdp-page" style={{ maxWidth: 960 }}>
      <style>{`
        @keyframes tdpSurfaceIn {
          from { opacity: 0; transform: translateY(10px); filter: blur(6px); }
          to { opacity: 1; transform: translateY(0); filter: blur(0); }
        }
        .tdp-page > * { animation: tdpSurfaceIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) both; }
        .tdp-page > *:nth-child(2) { animation-delay: 0.05s; }
        .tdp-page > *:nth-child(3) { animation-delay: 0.10s; }

        .tdp-shell {
          display: flex;
          flex-direction: column;
          gap: 18px;
          margin-top: 22px;
        }

        .tdp-section {
          padding: 0;
          overflow: visible;
        }
        .tdp-section-head {
          padding: 22px 26px 14px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
        }
        .tdp-section-head .recgon-label { margin-bottom: 4px; }
        .tdp-section-title {
          margin: 0;
          font-size: 17px;
          font-weight: 600;
          letter-spacing: -0.3px;
          color: var(--txt-pure);
        }
        .tdp-section-count {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 11px;
          letter-spacing: 0.8px;
          color: var(--txt-muted);
          padding: 4px 9px;
          background: rgba(0,0,0,0.04);
          border: 1px solid var(--btn-secondary-border);
          border-radius: 999px;
        }

        /* === HERO === */
        .tdp-hero {
          padding: 28px 30px;
          display: flex;
          gap: 22px;
          align-items: flex-start;
          position: relative;
          overflow: hidden;
        }
        .tdp-hero::before {
          content: '';
          position: absolute;
          top: 50%;
          left: 60px;
          width: 280px;
          height: 280px;
          transform: translate(-50%, -50%);
          background: radial-gradient(circle, var(--tdp-accent, rgba(var(--signature-rgb), 0.22)) 0%, transparent 65%);
          z-index: 0;
          pointer-events: none;
          opacity: 0.9;
          filter: blur(2px);
        }
        .tdp-hero > * { position: relative; z-index: 1; }

        .tdp-avatar-wrap {
          position: relative;
          flex-shrink: 0;
        }
        .tdp-avatar-btn {
          position: relative;
          width: 88px;
          height: 88px;
          border-radius: 22px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: 'Inter', sans-serif;
          font-weight: 800;
          font-size: 32px;
          color: #fff;
          letter-spacing: -1.2px;
          border: none;
          font-family: inherit;
          overflow: hidden;
          box-shadow:
            0 12px 30px -8px var(--tdp-avatar-glow, rgba(0,0,0,0.25)),
            inset 0 1px 0 rgba(255,255,255,0.22),
            inset 0 -3px 8px rgba(0,0,0,0.12),
            0 0 0 1px rgba(255,255,255,0.08);
          transition: box-shadow 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .tdp-avatar-btn[data-clickable="1"]:hover {
          box-shadow:
            0 0 0 5px rgba(var(--signature-rgb), 0.20),
            0 0 32px 4px rgba(var(--signature-rgb), 0.55),
            0 14px 38px -8px rgba(var(--signature-rgb), 0.45),
            inset 0 1px 0 rgba(255,255,255,0.28),
            inset 0 -3px 8px rgba(0,0,0,0.12),
            0 0 0 1px rgba(255,255,255,0.08);
        }
        .tdp-avatar-btn img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .tdp-avatar-overlay {
          position: absolute; inset: 0;
          background: rgba(0,0,0,0.55);
          backdrop-filter: blur(2px);
          display: flex; align-items: center; justify-content: center;
          opacity: 0;
          transition: opacity 0.18s;
          color: #fff;
          border-radius: inherit;
        }
        .tdp-avatar-btn[data-clickable="1"]:hover .tdp-avatar-overlay { opacity: 1; }

        .tdp-color-badge {
          position: absolute;
          bottom: -4px; right: -4px;
          width: 26px; height: 26px;
          border-radius: 50%;
          border: 3px solid var(--bg-deep);
          cursor: pointer;
          padding: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          box-shadow: 0 4px 10px -2px rgba(0,0,0,0.22);
          transition: transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .tdp-color-badge:hover { transform: rotate(45deg) scale(1.1); }

        .tdp-color-pop {
          position: absolute;
          top: 100%; left: 0;
          margin-top: 14px;
          z-index: 9999;
          padding: 12px;
          background: var(--glass-substrate);
          backdrop-filter: blur(40px) saturate(180%);
          -webkit-backdrop-filter: blur(40px) saturate(180%);
          border: 1px solid rgba(var(--signature-rgb), 0.18);
          border-radius: 16px;
          box-shadow: 0 12px 36px -8px rgba(0,0,0,0.3);
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 8px;
          animation: tdpSurfaceIn 0.25s cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        .tdp-color-swatch {
          width: 32px; height: 32px;
          border-radius: 10px;
          border: none;
          cursor: pointer;
          transition: transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.18s;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.2), inset 0 -2px 4px rgba(0,0,0,0.1);
        }
        .tdp-color-swatch:hover { transform: scale(1.12) rotate(-4deg); }
        .tdp-color-swatch[data-active="1"] {
          box-shadow: 0 0 0 2px var(--bg-deep), 0 0 0 4px var(--txt-pure), inset 0 1px 0 rgba(255,255,255,0.2);
        }

        .tdp-id { flex: 1; min-width: 0; padding-top: 2px; }
        .tdp-name-row {
          display: flex; align-items: center; gap: 8px;
          margin-bottom: 6px; flex-wrap: wrap;
        }
        .tdp-name {
          margin: 0;
          font-size: 30px;
          font-weight: 600;
          letter-spacing: -1.1px;
          line-height: 1.05;
          color: var(--txt-pure);
        }
        .tdp-edit-btn {
          background: none;
          border: none;
          color: var(--txt-faint);
          padding: 6px;
          border-radius: 8px;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          opacity: 0;
          transition: opacity 0.18s, background 0.15s, color 0.15s;
        }
        .tdp-name-row:hover .tdp-edit-btn,
        .tdp-desc-row:hover .tdp-edit-btn { opacity: 1; }
        .tdp-edit-btn:hover {
          background: rgba(var(--signature-rgb), 0.10);
          color: var(--signature);
        }

        .tdp-desc-row {
          display: flex; align-items: center; gap: 6px;
          margin-bottom: 14px;
        }
        .tdp-desc {
          font-size: 14px;
          color: var(--txt-muted);
          line-height: 1.5;
          max-width: 540px;
        }
        .tdp-desc[data-empty="1"] { font-style: italic; opacity: 0.55; }

        .tdp-meta-row {
          display: inline-flex; align-items: center; gap: 8px;
          flex-wrap: wrap;
        }
        .tdp-slug {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 11px;
          color: var(--txt-muted);
          background: rgba(0,0,0,0.04);
          border: 1px solid var(--btn-secondary-border);
          padding: 3px 9px;
          border-radius: 7px;
          letter-spacing: 0.3px;
        }
        .tdp-slug::before { content: '/'; opacity: 0.55; margin-right: 1px; }

        .tdp-role-pill {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 3px 10px;
          border-radius: 999px;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.6px;
          text-transform: uppercase;
        }
        .tdp-role-pill .dot {
          width: 5px; height: 5px; border-radius: 50%;
          background: currentColor;
          box-shadow: 0 0 6px currentColor;
        }

        /* === EDIT FORMS (rename / desc) === */
        .tdp-edit-form {
          display: flex; gap: 8px; align-items: center;
          margin-bottom: 6px;
          flex: 1;
        }
        .tdp-edit-input {
          flex: 1;
          padding: 8px 12px;
          background: var(--glass-hover);
          border: 1px solid rgba(var(--signature-rgb), 0.32);
          border-radius: 10px;
          color: var(--txt-pure);
          font-family: inherit;
          outline: none;
          box-shadow: 0 0 0 4px rgba(var(--signature-rgb), 0.10);
        }
        .tdp-edit-input.is-name { font-size: 22px; font-weight: 600; letter-spacing: -0.5px; }
        .tdp-edit-input.is-desc { font-size: 14px; }
        .tdp-edit-save {
          padding: 8px 14px;
          background: var(--btn-primary-bg);
          color: var(--btn-primary-txt);
          border: none;
          border-radius: 10px;
          font-weight: 600;
          font-size: 12px;
          cursor: pointer;
          font-family: inherit;
        }
        .tdp-edit-cancel {
          padding: 8px 12px;
          background: none;
          border: 1px solid var(--btn-secondary-border);
          border-radius: 10px;
          color: var(--txt-muted);
          font-size: 12px;
          cursor: pointer;
          font-family: inherit;
        }

        /* === MEMBERS === */
        .tdp-members-list {
          display: flex;
          flex-direction: column;
          padding: 0 14px 18px;
        }
        .tdp-member-row {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 14px;
          border-radius: 14px;
          transition: background 0.15s;
        }
        .tdp-member-row:hover { background: rgba(var(--signature-rgb), 0.04); }
        .tdp-member-row + .tdp-member-row { border-top: 1px solid var(--btn-secondary-border); }
        .tdp-member-avatar {
          width: 40px; height: 40px;
          border-radius: 12px;
          flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          font-weight: 700;
          font-size: 13px;
          color: #fff;
          letter-spacing: -0.3px;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.2), inset 0 -2px 4px rgba(0,0,0,0.1);
          overflow: hidden;
        }
        .tdp-member-avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .tdp-member-body { flex: 1; min-width: 0; }
        .tdp-member-name {
          margin: 0;
          font-weight: 600;
          font-size: 14px;
          color: var(--txt-pure);
          letter-spacing: -0.1px;
        }
        .tdp-member-email {
          margin: 2px 0 0;
          font-size: 12px;
          color: var(--txt-muted);
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          letter-spacing: 0.1px;
        }
        .tdp-member-actions {
          display: flex; align-items: center; gap: 8px;
          flex-shrink: 0;
        }
        .tdp-static-role {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.6px;
          text-transform: uppercase;
          padding: 4px 10px;
          border-radius: 999px;
          background: rgba(0,0,0,0.04);
          color: var(--txt-muted);
          border: 1px solid var(--btn-secondary-border);
        }
        .tdp-icon-danger-btn {
          background: none;
          border: 1px solid transparent;
          color: var(--txt-faint);
          padding: 7px;
          border-radius: 9px;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          transition: background 0.15s, color 0.15s, border-color 0.15s;
        }
        .tdp-icon-danger-btn:hover {
          background: rgba(255, 59, 48, 0.08);
          color: var(--danger);
          border-color: rgba(255, 59, 48, 0.22);
        }
        .tdp-confirm-strip {
          margin: 8px 0 0 54px;
          padding: 10px 12px;
          background: rgba(255, 59, 48, 0.06);
          border: 1px solid rgba(255, 59, 48, 0.18);
          border-radius: 12px;
          display: flex; align-items: center; gap: 8px;
          font-size: 13px;
        }
        .tdp-confirm-strip .msg { flex: 1; color: var(--txt); }
        .tdp-btn-danger {
          padding: 6px 12px;
          background: var(--danger);
          color: #fff;
          border: none;
          border-radius: 8px;
          font-weight: 600;
          font-size: 12px;
          cursor: pointer;
          font-family: inherit;
        }
        .tdp-btn-ghost {
          padding: 6px 11px;
          background: none;
          border: 1px solid var(--btn-secondary-border);
          border-radius: 8px;
          color: var(--txt-muted);
          font-size: 12px;
          cursor: pointer;
          font-family: inherit;
        }

        /* === INVITE === */
        .tdp-invite-body { padding: 0 26px 20px; }
        .tdp-invite-blurb {
          margin: 0 0 14px;
          font-size: 13px;
          color: var(--txt-muted);
          line-height: 1.55;
        }
        .tdp-invite-controls {
          display: flex; gap: 10px; align-items: center;
        }
        .tdp-invite-submit {
          padding: 11px 18px;
          background: var(--btn-primary-bg);
          color: var(--btn-primary-txt);
          border: none;
          border-radius: 10px;
          font-weight: 600;
          font-size: 13px;
          cursor: pointer;
          white-space: nowrap;
          font-family: inherit;
          transition: transform 0.15s, box-shadow 0.15s;
        }
        .tdp-invite-submit:hover { transform: translateY(-1px); box-shadow: 0 6px 14px -4px rgba(0,0,0,0.25); }
        .tdp-invite-submit:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

        .tdp-link-display {
          margin-top: 14px;
          padding: 12px 14px;
          background: linear-gradient(135deg, rgba(var(--signature-rgb), 0.10), rgba(var(--signature-rgb), 0.04));
          border: 1px solid rgba(var(--signature-rgb), 0.28);
          border-radius: 12px;
          display: flex; align-items: center; gap: 10px;
          animation: tdpSurfaceIn 0.35s cubic-bezier(0.16,1,0.3,1) both;
          position: relative;
        }
        .tdp-link-display::before {
          content: '✓ link generated';
          position: absolute;
          top: -8px; left: 12px;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.8px;
          text-transform: uppercase;
          color: var(--signature);
          background: var(--bg-deep);
          padding: 0 6px;
        }
        .tdp-link-code {
          flex: 1;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 12px;
          color: var(--signature);
          word-break: break-all;
          letter-spacing: 0.1px;
        }
        .tdp-copy-btn {
          flex-shrink: 0;
          display: inline-flex; align-items: center; gap: 5px;
          padding: 6px 11px;
          background: var(--btn-secondary-bg);
          border: 1px solid var(--btn-secondary-border);
          border-radius: 8px;
          color: var(--txt);
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          font-family: inherit;
          transition: background 0.15s;
        }
        .tdp-copy-btn:hover { background: var(--btn-secondary-hover); }

        .tdp-pending {
          margin: 18px 26px 0;
          padding-top: 16px;
          border-top: 1px dashed var(--btn-secondary-border);
        }
        .tdp-pending-list {
          display: flex; flex-direction: column; gap: 6px;
          margin-top: 8px;
        }
        .tdp-pending-row {
          padding: 10px 14px;
          background: rgba(0,0,0,0.025);
          border: 1px solid var(--btn-secondary-border);
          border-radius: 10px;
        }
        .tdp-pending-head {
          display: flex; align-items: center; gap: 10px;
        }
        .tdp-pending-label {
          flex: 1;
          font-size: 13px;
          color: var(--txt-pure);
          display: inline-flex; align-items: center; gap: 8px;
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          letter-spacing: 0.1px;
        }
        .tdp-pending-label svg { color: var(--txt-faint); }
        .tdp-pending-meta {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 10px;
          color: var(--txt-muted);
          letter-spacing: 0.5px;
        }
        .tdp-revoke-link {
          background: none;
          border: none;
          color: var(--danger);
          cursor: pointer;
          font-size: 12px;
          font-weight: 600;
          padding: 4px 8px;
          border-radius: 7px;
          font-family: inherit;
          transition: background 0.15s;
        }
        .tdp-revoke-link:hover { background: rgba(255, 59, 48, 0.08); }

        /* === DANGER / LEAVE === */
        .tdp-zone {
          padding: 18px 24px;
          display: flex; align-items: center; justify-content: space-between;
          gap: 16px;
        }
        .tdp-zone-copy { margin: 0; font-size: 13px; color: var(--txt-muted); }
        .tdp-leave-card {
          background: var(--bg-content) padding-box,
            linear-gradient(135deg,
              rgba(255, 159, 10, 0.28) 0%,
              rgba(255, 255, 255, 0.04) 50%,
              rgba(255, 159, 10, 0.10) 100%) border-box;
        }
        .tdp-danger-card {
          background: var(--bg-content) padding-box,
            linear-gradient(135deg,
              rgba(255, 59, 48, 0.32) 0%,
              rgba(255, 255, 255, 0.04) 50%,
              rgba(255, 59, 48, 0.12) 100%) border-box;
        }
        .tdp-zone-action-leave {
          padding: 9px 16px;
          background: none;
          color: var(--warning);
          border: 1px solid rgba(255, 159, 10, 0.45);
          border-radius: 10px;
          font-weight: 600;
          font-size: 13px;
          cursor: pointer;
          font-family: inherit;
          transition: background 0.15s;
        }
        .tdp-zone-action-leave:hover { background: rgba(255, 159, 10, 0.08); }
        .tdp-zone-action-delete {
          padding: 9px 16px;
          background: var(--danger);
          color: #fff;
          border: none;
          border-radius: 10px;
          font-weight: 600;
          font-size: 13px;
          cursor: pointer;
          font-family: inherit;
          transition: transform 0.15s, box-shadow 0.15s;
        }
        .tdp-zone-action-delete:hover {
          transform: translateY(-1px);
          box-shadow: 0 8px 20px -4px rgba(255, 59, 48, 0.4);
        }
      `}</style>

      {/* Hidden file input for avatar upload */}
      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarUpload}
        style={{ display: 'none' }} />

      {/* ── Page header: team identity (banner) ── */}
      <section
        className="glass-card tdp-section tdp-hero"
        style={{ ['--tdp-accent' as string]: `${avatarColor}40`, ['--tdp-avatar-glow' as string]: `${avatarColor}99`, marginBottom: 18 }}
      >
        <div ref={colorPickerRef} className="tdp-avatar-wrap">
          <button
            type="button"
            onClick={() => isOwner && fileInputRef.current?.click()}
            title={isOwner ? 'Upload team photo' : undefined}
            disabled={avatarUploading}
            data-clickable={isOwner ? '1' : undefined}
            className="tdp-avatar-btn"
            style={{
              background: avatarUrl ? 'transparent' : `linear-gradient(135deg, ${avatarColor}, color-mix(in srgb, ${avatarColor} 70%, #000))`,
              opacity: avatarUploading ? 0.6 : 1,
              cursor: isOwner ? 'pointer' : 'default',
            }}
          >
            {avatarUrl ? <img src={avatarUrl} alt={team.name} /> : initials(team.name)}
            {isOwner && (
              <div className="tdp-avatar-overlay">
                <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                  <circle cx="12" cy="13" r="4"/>
                </svg>
              </div>
            )}
          </button>

          {isOwner && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setShowColorPicker((v) => !v); }}
              title="Change color"
              className="tdp-color-badge"
              style={{ background: avatarColor }}
            >
              <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="3" /><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
              </svg>
            </button>
          )}

          {showColorPicker && (
            <div className="tdp-color-pop">
              {AVATAR_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => handlePickColor(c)}
                  className="tdp-color-swatch"
                  data-active={c === avatarColor ? '1' : undefined}
                  style={{ background: c }}
                />
              ))}
            </div>
          )}
        </div>

        <div className="tdp-id">
          <span className="recgon-label" style={{ marginBottom: 8 }}>team workspace</span>

          {renaming ? (
            <form onSubmit={handleRename} className="tdp-edit-form" style={{ marginBottom: 10 }}>
              <input
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                required
                minLength={2}
                className="tdp-edit-input is-name"
              />
              <button type="submit" disabled={renameLoading} className="tdp-edit-save">
                {renameLoading ? '…' : 'Save'}
              </button>
              <button type="button" onClick={() => { setRenaming(false); setRenameValue(team.name); }} className="tdp-edit-cancel">
                Cancel
              </button>
            </form>
          ) : (
            <div className="tdp-name-row">
              <h1 className="tdp-name">{team.name}</h1>
              {isOwner && (
                <button onClick={() => setRenaming(true)} title="Rename team" className="tdp-edit-btn">
                  <EditIcon size={14} />
                </button>
              )}
            </div>
          )}

          {editingDesc ? (
            <form onSubmit={handleSaveDescription} className="tdp-edit-form" style={{ marginBottom: 10 }}>
              <input
                autoFocus
                value={descValue}
                onChange={(e) => setDescValue(e.target.value)}
                maxLength={120}
                placeholder="Short description…"
                className="tdp-edit-input is-desc"
              />
              <button type="submit" disabled={descLoading} className="tdp-edit-save">
                {descLoading ? '…' : 'Save'}
              </button>
              <button type="button" onClick={() => { setEditingDesc(false); setDescValue(team.description ?? ''); }} className="tdp-edit-cancel">
                Cancel
              </button>
            </form>
          ) : (
            <div className="tdp-desc-row">
              <span className="tdp-desc" data-empty={team.description ? undefined : '1'}>
                {team.description || (isOwner ? 'Add a description…' : 'No description.')}
              </span>
              {isOwner && (
                <button onClick={() => setEditingDesc(true)} title="Edit description" className="tdp-edit-btn">
                  <EditIcon size={12} />
                </button>
              )}
            </div>
          )}

          <div className="tdp-meta-row">
            <code className="tdp-slug">{team.slug}</code>
            <span
              className="tdp-role-pill"
              style={{
                background: 'rgba(var(--signature-rgb), 0.12)',
                color: 'var(--signature)',
                border: '1px solid rgba(var(--signature-rgb), 0.38)',
              }}
            >
              <span className="dot" />
              {team.role}
            </span>
          </div>
        </div>
      </section>

      {/* ── Recgon Admin (dispatcher + roster + tasks) ── */}
      <RecgonAdminPanel teamId={id} />

      {/* ── Team management shell (people, invites, danger) ── */}
      <div className="tdp-shell">

      {/* ── People ── */}
      <section className="glass-card tdp-section">
        <div className="tdp-section-head">
          <div>
            <span className="recgon-label">people</span>
            <h2 className="tdp-section-title">Team access</h2>
          </div>
          <span className="tdp-section-count">{members.length.toString().padStart(2, '0')} active</span>
        </div>
        <div className="tdp-members-list">
          {members.map((m) => {
            const displayName = m.nickname || m.email?.split('@')[0] || 'Unknown';
            const isConfirmingRemove = pendingConfirm?.type === 'remove' && pendingConfirm.userId === m.userId;
            const memberColor = defaultColor(displayName);
            return (
              <div key={m.userId}>
                <div className="tdp-member-row">
                  <div
                    className="tdp-member-avatar"
                    style={{
                      background: m.avatarUrl ? 'transparent' : `linear-gradient(135deg, ${memberColor}, color-mix(in srgb, ${memberColor} 70%, #000))`,
                    }}
                  >
                    {m.avatarUrl ? <img src={m.avatarUrl} alt={displayName} /> : initials(displayName)}
                  </div>
                  <div className="tdp-member-body">
                    <p className="tdp-member-name">{displayName}</p>
                    {m.email && <p className="tdp-member-email">{m.email}</p>}
                  </div>
                  <div className="tdp-member-actions">
                    {isOwner ? (
                      <RoleDropdown
                        value={m.role}
                        onChange={(v) => handleRoleChange(m.userId, v)}
                        disabled={!!roleChangeLoading[m.userId]}
                      />
                    ) : (
                      <span className="tdp-static-role">{m.role}</span>
                    )}
                    {isOwner && members.length > 1 && !isConfirmingRemove && (
                      <button
                        onClick={() => setPendingConfirm({ type: 'remove', userId: m.userId })}
                        title="Remove member"
                        className="tdp-icon-danger-btn"
                      >
                        <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                          <circle cx="9" cy="7" r="4"/>
                          <line x1="18" y1="8" x2="23" y2="13"/><line x1="23" y1="8" x2="18" y2="13"/>
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
                {isConfirmingRemove && (
                  <div className="tdp-confirm-strip">
                    <span className="msg">Remove <strong>{displayName}</strong>?</span>
                    <button onClick={() => handleRemoveMember(m.userId)} className="tdp-btn-danger">Remove</button>
                    <button onClick={() => setPendingConfirm(null)} className="tdp-btn-ghost">Cancel</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Invite ── */}
      {canInvite && (
        <section id="invite" className="glass-card tdp-section">
          <div className="tdp-section-head">
            <div>
              <span className="recgon-label">invite</span>
              <h2 className="tdp-section-title">Generate access link</h2>
            </div>
            {pendingInvites.length > 0 && (
              <span className="tdp-section-count">{pendingInvites.length} pending</span>
            )}
          </div>

          <div className="tdp-invite-body">
            <p className="tdp-invite-blurb">
              Single-use, time-boxed link. Anyone with the URL who signs in is added to the team at the chosen role.
            </p>
            <form onSubmit={handleInvite}>
              <div className="tdp-invite-controls">
                <RoleDropdown
                  value={inviteRole}
                  onChange={(v) => setInviteRole(v as 'member' | 'viewer')}
                />
                <button type="submit" disabled={actionLoading} className="tdp-invite-submit">
                  {actionLoading ? 'Generating…' : 'Generate link →'}
                </button>
              </div>

              {inviteLink && (
                <div className="tdp-link-display">
                  <code className="tdp-link-code">{inviteLink}</code>
                  <button
                    type="button"
                    onClick={async () => {
                      await navigator.clipboard.writeText(inviteLink).catch(() => {});
                      addToast('Copied!', 'success');
                    }}
                    className="tdp-copy-btn"
                  >
                    <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                    </svg>
                    Copy
                  </button>
                </div>
              )}
            </form>
          </div>

          {pendingInvites.length > 0 && (
            <div className="tdp-pending">
              <span className="recgon-label">pending invites</span>
              <div className="tdp-pending-list">
                {pendingInvites.map((inv) => {
                  const isConfirmingRevoke = pendingConfirm?.type === 'revoke' && pendingConfirm.inviteId === inv.id;
                  return (
                    <div key={inv.id} className="tdp-pending-row">
                      <div className="tdp-pending-head">
                        <span className="tdp-pending-label">
                          <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                          </svg>
                          {inv.email ?? 'Invite link'}
                        </span>
                        <span className="tdp-static-role">{inv.role}</span>
                        <span className="tdp-pending-meta">{relativeExpiry(inv.expiresAt)}</span>
                        {!isConfirmingRevoke && (
                          <button onClick={() => setPendingConfirm({ type: 'revoke', inviteId: inv.id })} className="tdp-revoke-link">
                            Revoke
                          </button>
                        )}
                      </div>
                      {isConfirmingRevoke && (
                        <div className="tdp-confirm-strip" style={{ marginLeft: 0, marginTop: 8 }}>
                          <span className="msg">Revoke this invite?</span>
                          <button onClick={() => handleRevokeInvite(inv.id)} className="tdp-btn-danger">Confirm</button>
                          <button onClick={() => setPendingConfirm(null)} className="tdp-btn-ghost">Cancel</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      )}

      {/* ── Leave team ── */}
      {!isOwner && session?.user?.id && (
        <section className="glass-card tdp-section tdp-leave-card">
          <div className="tdp-section-head">
            <div>
              <span className="recgon-label" style={{ color: 'var(--warning)' }}>leave</span>
              <h2 className="tdp-section-title">Leave this team</h2>
            </div>
          </div>
          <div className="tdp-zone">
            {pendingConfirm?.type === 'leave' ? (
              <>
                <span className="tdp-zone-copy" style={{ color: 'var(--txt-pure)' }}>
                  Leave <strong>{team.name}</strong>? You&apos;ll lose access to all its projects.
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={handleLeaveTeam} className="tdp-btn-danger">Leave</button>
                  <button onClick={() => setPendingConfirm(null)} className="tdp-btn-ghost">Cancel</button>
                </div>
              </>
            ) : (
              <>
                <p className="tdp-zone-copy">You will lose access to all projects in this team.</p>
                <button onClick={() => setPendingConfirm({ type: 'leave' })} className="tdp-zone-action-leave">
                  Leave team
                </button>
              </>
            )}
          </div>
        </section>
      )}

      {/* ── Danger zone ── */}
      {isOwner && (
        <section className="glass-card tdp-section tdp-danger-card">
          <div className="tdp-section-head">
            <div>
              <span className="recgon-label" style={{ color: 'var(--danger)' }}>danger zone</span>
              <h2 className="tdp-section-title">Delete team</h2>
            </div>
          </div>
          <div className="tdp-zone">
            {pendingConfirm?.type === 'delete' ? (
              <>
                <span className="tdp-zone-copy" style={{ color: 'var(--txt-pure)' }}>
                  Permanently delete <strong>{team.name}</strong>? This cannot be undone.
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={handleDeleteTeam} className="tdp-btn-danger">Delete</button>
                  <button onClick={() => setPendingConfirm(null)} className="tdp-btn-ghost">Cancel</button>
                </div>
              </>
            ) : (
              <>
                <p className="tdp-zone-copy">All projects, members, and data will be permanently deleted.</p>
                <button onClick={() => setPendingConfirm({ type: 'delete' })} className="tdp-zone-action-delete">
                  Delete team
                </button>
              </>
            )}
          </div>
        </section>
      )}
      </div>{/* /tdp-shell */}
    </div>
  );
}
