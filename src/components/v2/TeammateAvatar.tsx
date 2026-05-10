'use client';

import type { CSSProperties } from 'react';

const AVATAR_COLORS = [
  '#ec4899', '#f97316', '#eab308', '#10b981',
  '#06b6d4', '#8b5cf6', '#f43f5e', '#22c55e',
  '#3b82f6', '#0ea5e9', '#14b8a6', '#84cc16',
];

export function defaultAvatarColor(name: string): string {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

export function teammateInitials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || (name[0]?.toUpperCase() ?? '?');
}

export type TeammateAvatarProps = {
  name: string;
  avatarUrl?: string | null;
  avatarColor?: string | null;
  size?: number;
  fontSize?: number;
  isIdle?: boolean;
  className?: string;
};

export function TeammateAvatar({
  name,
  avatarUrl,
  avatarColor,
  size = 22,
  fontSize,
  isIdle,
  className,
}: TeammateAvatarProps) {
  const hasImage = Boolean(avatarUrl);
  const bg = hasImage ? 'transparent' : (avatarColor ?? defaultAvatarColor(name));

  const style: CSSProperties = {
    width: size,
    height: size,
    background: bg,
    color: 'white',
    boxShadow: '0 0 0 1px rgba(255, 255, 255, 0.06)',
    fontSize: fontSize ?? Math.round(size * 0.45),
    opacity: isIdle ? 0.55 : undefined,
  };

  return (
    <span
      className={`v2-tm-avatar${className ? ` ${className}` : ''}`}
      data-has-image={hasImage ? 'true' : undefined}
      data-idle={isIdle ? 'true' : undefined}
      aria-hidden="true"
      style={style}
    >
      {hasImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarUrl!} alt="" className="v2-tm-avatar-img" />
      ) : (
        teammateInitials(name)
      )}
      <style>{stylesheet}</style>
    </span>
  );
}

const stylesheet = `
  .v2-tm-avatar {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    flex-shrink: 0;
    overflow: hidden;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-weight: 700;
    letter-spacing: 0;
    line-height: 1;
    user-select: none;
  }
  .v2-tm-avatar-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    border-radius: inherit;
  }
`;
