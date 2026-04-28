'use client';

import { useEffect, useRef, useState, use, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useTeam } from '@/components/TeamProvider';
import { useToast } from '@/components/Toast';

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
  email: string;
  role: string;
  expiresAt: string;
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

  const [inviteEmail, setInviteEmail] = useState('');
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
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`/api/teams/${id}/avatar`, { method: 'POST', body: formData });
    if (res.ok) {
      const d = await res.json();
      setTeam((p) => p ? { ...p, avatarUrl: d.avatarUrl } : p);
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
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const link = `${window.location.origin}/teams/invite/${data.token}`;
      setInviteLink(link);
      setInviteEmail('');
      const ir = await fetch(`/api/teams/${id}/invitations`);
      if (ir.ok) setPendingInvites(await ir.json());
      try { await navigator.clipboard.writeText(link); addToast('Invite link copied!', 'success'); }
      catch { addToast('Invite link generated — copy it below', 'info'); }
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Failed to send invite', 'error');
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
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '3rem 0', color: 'var(--txt-muted)', fontSize: '0.9rem' }}>
      <div style={{ width: 16, height: 16, border: '2px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      Loading team…
    </div>
  );
  if (!team) return <p style={{ color: 'var(--danger)', padding: '2rem 0' }}>Team not found</p>;

  const isOwner = team.role === 'owner';
  const canInvite = isOwner || team.role === 'member';
  const avatarColor = team.avatarColor ?? defaultColor(team.name);
  const avatarUrl = team.avatarUrl;

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '0.55rem 0.75rem',
    background: 'var(--btn-secondary-bg)', border: '1px solid var(--btn-secondary-border)',
    borderRadius: 'var(--r-sm)', color: 'var(--txt-pure)', fontSize: '0.9rem',
    outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
  };

  const ghostBtn: React.CSSProperties = {
    background: 'none', border: 'none', cursor: 'pointer',
    color: 'var(--txt-muted)', padding: '2px', borderRadius: 4,
    display: 'inline-flex', alignItems: 'center', opacity: 0.55,
  };

  const sectionLabel: React.CSSProperties = {
    fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em',
    textTransform: 'uppercase', color: 'var(--txt-muted)', margin: '0 0 0.6rem',
  };

  return (
    <div style={{ maxWidth: 580 }}>

      {/* Hidden file input for avatar upload */}
      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarUpload}
        style={{ display: 'none' }} />

      {/* ── Header ── */}
      <div style={{
        display: 'flex', gap: '1.25rem', alignItems: 'flex-start',
        marginBottom: '1.75rem',
      }}>

        {/* Avatar with photo upload + color picker */}
        <div ref={colorPickerRef} style={{ position: 'relative', flexShrink: 0 }}>
          {/* Main avatar button — click to upload photo (owner only) */}
          <button
            type="button"
            onClick={() => isOwner && fileInputRef.current?.click()}
            title={isOwner ? 'Upload team photo' : undefined}
            disabled={avatarUploading}
            style={{
              position: 'relative', width: 64, height: 64, borderRadius: 16,
              background: avatarUrl ? 'transparent' : avatarColor,
              boxShadow: avatarUrl ? 'none' : `0 4px 14px ${avatarColor}55`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 800, fontSize: '1.35rem', color: '#fff', letterSpacing: '-1px',
              border: 'none', cursor: isOwner ? 'pointer' : 'default',
              fontFamily: 'inherit', overflow: 'hidden',
              opacity: avatarUploading ? 0.6 : 1,
            }}
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt={team.name}
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            ) : (
              initials(team.name)
            )}
            {/* Camera overlay on hover */}
            {isOwner && (
              <div style={{
                position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                opacity: 0, transition: 'opacity 0.15s',
                borderRadius: 'inherit',
              }}
              className="avatar-hover-overlay">
                <svg width="20" height="20" fill="none" stroke="white" strokeWidth={2} viewBox="0 0 24 24">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                  <circle cx="12" cy="13" r="4"/>
                </svg>
              </div>
            )}
          </button>

          {/* Color picker badge (owner only, shown when no photo) */}
          {isOwner && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setShowColorPicker((v) => !v); }}
              title="Change color"
              style={{
                position: 'absolute', bottom: -3, right: -3, width: 20, height: 20,
                background: avatarColor, border: '2px solid var(--bg-deep)',
                borderRadius: '50%', cursor: 'pointer', padding: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <svg width="9" height="9" fill="none" stroke="white" strokeWidth={2.5} viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="3" /><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
              </svg>
            </button>
          )}

          {/* Color palette popup */}
          {showColorPicker && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, marginTop: 10, zIndex: 9999,
              background: 'var(--glass-substrate)', backdropFilter: 'blur(30px)',
              WebkitBackdropFilter: 'blur(30px)',
              border: '1px solid var(--border)', borderRadius: 12,
              padding: '0.75rem', boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
              display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6,
            }}>
              {AVATAR_COLORS.map((c) => (
                <button key={c} type="button" onClick={() => handlePickColor(c)} style={{
                  width: 28, height: 28, borderRadius: 7, background: c, border: 'none',
                  cursor: 'pointer', outline: c === avatarColor ? `2px solid var(--txt-pure)` : 'none',
                  outlineOffset: 2,
                }} />
              ))}
            </div>
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Name */}
          {renaming ? (
            <form onSubmit={handleRename} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.3rem' }}>
              <input autoFocus value={renameValue} onChange={(e) => setRenameValue(e.target.value)}
                required minLength={2}
                style={{ ...inputStyle, flex: 1, fontSize: '1.05rem', fontWeight: 700, padding: '0.3rem 0.5rem', width: 'auto' }} />
              <button type="submit" disabled={renameLoading} style={{
                padding: '0.3rem 0.75rem', background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-txt)',
                border: 'none', borderRadius: 'var(--r-sm)', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer',
              }}>{renameLoading ? '…' : 'Save'}</button>
              <button type="button" onClick={() => { setRenaming(false); setRenameValue(team.name); }} style={{
                padding: '0.3rem 0.6rem', background: 'none', border: '1px solid var(--border)',
                borderRadius: 'var(--r-sm)', color: 'var(--txt-muted)', fontSize: '0.82rem', cursor: 'pointer',
              }}>Cancel</button>
            </form>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.2rem' }}>
              <h1 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: 'var(--txt-pure)', letterSpacing: '-0.3px' }}>
                {team.name}
              </h1>
              {isOwner && (
                <button onClick={() => setRenaming(true)} title="Rename" style={ghostBtn}><EditIcon /></button>
              )}
            </div>
          )}

          {/* Description */}
          {editingDesc ? (
            <form onSubmit={handleSaveDescription} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.4rem' }}>
              <input autoFocus value={descValue} onChange={(e) => setDescValue(e.target.value)}
                maxLength={120} placeholder="Short description…"
                style={{ ...inputStyle, flex: 1, fontSize: '0.85rem', padding: '0.28rem 0.5rem', width: 'auto' }} />
              <button type="submit" disabled={descLoading} style={{
                padding: '0.25rem 0.6rem', background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-txt)',
                border: 'none', borderRadius: 'var(--r-sm)', fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer',
              }}>{descLoading ? '…' : 'Save'}</button>
              <button type="button" onClick={() => { setEditingDesc(false); setDescValue(team.description ?? ''); }} style={{
                padding: '0.25rem 0.5rem', background: 'none', border: '1px solid var(--border)',
                borderRadius: 'var(--r-sm)', color: 'var(--txt-muted)', fontSize: '0.78rem', cursor: 'pointer',
              }}>Cancel</button>
            </form>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginBottom: '0.45rem' }}>
              <span style={{
                fontSize: '0.85rem',
                color: 'var(--txt-muted)',
                opacity: team.description ? 1 : 0.4,
                fontStyle: team.description ? 'normal' : 'italic',
              }}>
                {team.description || (isOwner ? 'Add a description…' : '')}
              </span>
              {isOwner && (
                <button onClick={() => setEditingDesc(true)} title="Edit description" style={ghostBtn}><EditIcon size={11} /></button>
              )}
            </div>
          )}

          {/* Slug + role pill */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <code style={{
              fontSize: '0.72rem', color: 'var(--txt-muted)',
              background: 'var(--btn-secondary-bg)', border: '1px solid var(--btn-secondary-border)',
              padding: '1px 7px', borderRadius: 5,
            }}>{team.slug}</code>
            <span style={{
              fontSize: '0.7rem', fontWeight: 700, padding: '2px 9px', borderRadius: 20,
              background: `${avatarColor}22`, color: avatarColor,
              border: `1px solid ${avatarColor}44`,
            }}>{team.role}</span>
          </div>
        </div>
      </div>

      {/* ── Members ── */}
      <div style={{ marginBottom: '1.5rem' }}>
        <p style={sectionLabel}>Members · {members.length}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {members.map((m) => {
            const displayName = m.nickname || m.email?.split('@')[0] || 'Unknown';
            const isConfirmingRemove = pendingConfirm?.type === 'remove' && pendingConfirm.userId === m.userId;
            return (
              <div key={m.userId} style={{
                padding: '0.7rem 1rem', background: 'var(--bg-card)',
                border: '1px solid var(--border)', borderRadius: 12,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <MemberAvatar member={m} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontWeight: 600, fontSize: '0.88rem', color: 'var(--txt-pure)' }}>{displayName}</p>
                    {m.email && <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--txt-muted)' }}>{m.email}</p>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                    {isOwner ? (
                      <RoleDropdown
                        value={m.role}
                        onChange={(v) => handleRoleChange(m.userId, v)}
                        disabled={!!roleChangeLoading[m.userId]}
                      />
                    ) : (
                      <span style={{
                        fontSize: '0.75rem', fontWeight: 600, padding: '2px 9px', borderRadius: 20,
                        background: 'var(--btn-secondary-bg)', color: 'var(--txt-muted)',
                        border: '1px solid var(--btn-secondary-border)', textTransform: 'capitalize',
                      }}>{m.role}</span>
                    )}
                    {isOwner && members.length > 1 && !isConfirmingRemove && (
                      <button onClick={() => setPendingConfirm({ type: 'remove', userId: m.userId })}
                        title="Remove member"
                        style={{ ...ghostBtn, color: 'var(--danger)', opacity: 0.65 }}>
                        <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                          <circle cx="9" cy="7" r="4"/>
                          <line x1="18" y1="8" x2="23" y2="13"/><line x1="23" y1="8" x2="18" y2="13"/>
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
                {isConfirmingRemove && (
                  <div style={{
                    marginTop: '0.55rem', paddingTop: '0.55rem', borderTop: '1px solid var(--border)',
                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                  }}>
                    <span style={{ flex: 1, fontSize: '0.82rem', color: 'var(--txt-muted)' }}>Remove {displayName}?</span>
                    <button onClick={() => handleRemoveMember(m.userId)} style={{
                      padding: '0.25rem 0.75rem', background: 'var(--danger)', color: '#fff',
                      border: 'none', borderRadius: 'var(--r-sm)', fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer',
                    }}>Remove</button>
                    <button onClick={() => setPendingConfirm(null)} style={{
                      padding: '0.25rem 0.6rem', background: 'none', border: '1px solid var(--border)',
                      borderRadius: 'var(--r-sm)', color: 'var(--txt-muted)', fontSize: '0.78rem', cursor: 'pointer',
                    }}>Cancel</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Invite ── */}
      {canInvite && (
        <div style={{ marginBottom: '1.5rem' }}>
          <p style={sectionLabel}>Invite member</p>
          <div style={{
            padding: '1rem 1.25rem', background: 'var(--bg-card)',
            border: '1px solid var(--border)', borderRadius: 12,
          }}>
            <form onSubmit={handleInvite}>
              <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
                <input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="teammate@example.com" required style={{ ...inputStyle, flex: 1 }} />
                <RoleDropdown
                  value={inviteRole}
                  onChange={(v) => setInviteRole(v as 'member' | 'viewer')}
                />
                <button type="submit" disabled={actionLoading} style={{
                  padding: '0.55rem 1rem', background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-txt)',
                  border: 'none', borderRadius: 'var(--r-sm)', fontWeight: 600, fontSize: '0.85rem',
                  cursor: actionLoading ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit',
                }}>{actionLoading ? 'Sending…' : 'Invite'}</button>
              </div>

              {inviteLink && (
                <div style={{
                  marginTop: '0.85rem', padding: '0.6rem 0.85rem',
                  background: 'rgba(var(--signature-rgb), 0.06)',
                  border: '1px solid rgba(var(--signature-rgb), 0.15)',
                  borderRadius: 8, display: 'flex', alignItems: 'center', gap: '0.75rem',
                }}>
                  <code style={{ flex: 1, fontSize: '0.78rem', color: 'var(--signature)', wordBreak: 'break-all' }}>{inviteLink}</code>
                  <button type="button" onClick={async () => {
                    await navigator.clipboard.writeText(inviteLink).catch(() => {});
                    addToast('Copied!', 'success');
                  }} style={{
                    flexShrink: 0, padding: '0.28rem 0.65rem', background: 'var(--btn-secondary-bg)',
                    border: '1px solid var(--btn-secondary-border)', borderRadius: 'var(--r-sm)',
                    color: 'var(--txt)', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 500,
                    display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'inherit',
                  }}>
                    <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                    </svg>
                    Copy
                  </button>
                </div>
              )}
            </form>

            {pendingInvites.length > 0 && (
              <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
                <p style={{ ...sectionLabel, margin: '0 0 0.5rem' }}>Pending · {pendingInvites.length}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  {pendingInvites.map((inv) => {
                    const isConfirmingRevoke = pendingConfirm?.type === 'revoke' && pendingConfirm.inviteId === inv.id;
                    return (
                      <div key={inv.id} style={{
                        padding: '0.5rem 0.75rem', borderRadius: 8,
                        background: 'var(--btn-secondary-bg)', border: '1px solid var(--btn-secondary-border)',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                          <span style={{ flex: 1, fontSize: '0.85rem', color: 'var(--txt-pure)' }}>{inv.email}</span>
                          <span style={{
                            fontSize: '0.68rem', fontWeight: 600, padding: '1px 7px', borderRadius: 20,
                            background: 'var(--btn-secondary-bg)', color: 'var(--txt-muted)',
                            border: '1px solid var(--border)', textTransform: 'capitalize',
                          }}>{inv.role}</span>
                          <span style={{ fontSize: '0.72rem', color: 'var(--txt-muted)' }}>{relativeExpiry(inv.expiresAt)}</span>
                          {!isConfirmingRevoke && (
                            <button onClick={() => setPendingConfirm({ type: 'revoke', inviteId: inv.id })}
                              style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: '0.75rem', padding: '0 2px', fontFamily: 'inherit' }}>
                              Revoke
                            </button>
                          )}
                        </div>
                        {isConfirmingRevoke && (
                          <div style={{ marginTop: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ flex: 1, fontSize: '0.8rem', color: 'var(--txt-muted)' }}>Revoke this invite?</span>
                            <button onClick={() => handleRevokeInvite(inv.id)} style={{
                              padding: '0.2rem 0.6rem', background: 'var(--danger)', color: '#fff',
                              border: 'none', borderRadius: 'var(--r-sm)', fontWeight: 600, cursor: 'pointer', fontSize: '0.75rem', fontFamily: 'inherit',
                            }}>Confirm</button>
                            <button onClick={() => setPendingConfirm(null)} style={{
                              padding: '0.2rem 0.5rem', background: 'none', border: '1px solid var(--border)',
                              borderRadius: 'var(--r-sm)', color: 'var(--txt-muted)', cursor: 'pointer', fontSize: '0.75rem', fontFamily: 'inherit',
                            }}>Cancel</button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Leave team ── */}
      {!isOwner && session?.user?.id && (
        <div style={{ marginBottom: '1.5rem' }}>
          <p style={sectionLabel}>Leave team</p>
          <div style={{ padding: '0.9rem 1.25rem', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12 }}>
            {pendingConfirm?.type === 'leave' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ flex: 1, fontSize: '0.88rem', color: 'var(--txt)' }}>Leave <strong>{team.name}</strong>?</span>
                <button onClick={handleLeaveTeam} style={{
                  padding: '0.35rem 0.85rem', background: 'var(--danger)', color: '#fff',
                  border: 'none', borderRadius: 'var(--r-sm)', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'inherit',
                }}>Leave</button>
                <button onClick={() => setPendingConfirm(null)} style={{
                  padding: '0.35rem 0.7rem', background: 'none', border: '1px solid var(--border)',
                  borderRadius: 'var(--r-sm)', color: 'var(--txt-muted)', fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'inherit',
                }}>Cancel</button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
                <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--txt-muted)' }}>You will lose access to all projects in this team.</p>
                <button onClick={() => setPendingConfirm({ type: 'leave' })} style={{
                  flexShrink: 0, padding: '0.4rem 0.9rem', background: 'none',
                  color: 'var(--danger)', border: '1px solid var(--danger)',
                  borderRadius: 'var(--r-sm)', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'inherit',
                }}>Leave team</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Danger zone ── */}
      {isOwner && (
        <div>
          <p style={{ ...sectionLabel, color: 'var(--danger)', opacity: 0.8 }}>Danger zone</p>
          <div style={{
            padding: '0.9rem 1.25rem', background: 'var(--bg-card)',
            border: '1px solid rgba(239,68,68,0.3)', borderRadius: 12,
          }}>
            {pendingConfirm?.type === 'delete' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ flex: 1, fontSize: '0.88rem', color: 'var(--txt)' }}>Permanently delete <strong>{team.name}</strong>?</span>
                <button onClick={handleDeleteTeam} style={{
                  padding: '0.35rem 0.85rem', background: 'var(--danger)', color: '#fff',
                  border: 'none', borderRadius: 'var(--r-sm)', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'inherit',
                }}>Delete</button>
                <button onClick={() => setPendingConfirm(null)} style={{
                  padding: '0.35rem 0.7rem', background: 'none', border: '1px solid var(--border)',
                  borderRadius: 'var(--r-sm)', color: 'var(--txt-muted)', fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'inherit',
                }}>Cancel</button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
                <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--txt-muted)' }}>All projects and data will be permanently deleted.</p>
                <button onClick={() => setPendingConfirm({ type: 'delete' })} style={{
                  flexShrink: 0, padding: '0.4rem 0.9rem', background: 'var(--danger)', color: '#fff',
                  border: 'none', borderRadius: 'var(--r-sm)', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'inherit',
                }}>Delete team</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
