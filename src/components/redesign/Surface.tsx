'use client';

import { ReactNode } from 'react';

/* ============================================================
   Surface primitives for the Recgon redesign.
   Every container in /redesign should be one of these.
   ============================================================ */

export function PaperCard({
  children,
  interactive = false,
  recessed = false,
  bare = false,
  className = '',
  as: Tag = 'div',
  ...rest
}: {
  children: ReactNode;
  interactive?: boolean;
  recessed?: boolean;
  bare?: boolean;
  className?: string;
  as?: keyof React.JSX.IntrinsicElements;
  [k: string]: unknown;
}) {
  const cls = [
    bare ? 'paper-card paper-card--bare' : 'paper-card',
    interactive && 'is-interactive',
    recessed && 'is-recessed',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  // @ts-expect-error -- runtime tag string
  return <Tag className={cls} {...rest}>{children}</Tag>;
}

export function InkRule({ size = 'base' }: { size?: 'tight' | 'base' | 'loose' }) {
  const cls = `ink-rule ${size === 'tight' ? 'ink-rule--tight' : size === 'loose' ? 'ink-rule--loose' : ''}`.trim();
  return <hr className={cls} />;
}

export function Stamp({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`stamp ${className}`.trim()}>{children}</span>;
}

export function VintageChip({
  children,
  tone = 'neutral',
  dot = false,
  className = '',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'sage' | 'ochre' | 'rust' | 'pink';
  dot?: boolean;
  className?: string;
}) {
  const toneCls = tone === 'neutral' ? '' : `vintage-chip--${tone}`;
  return (
    <span className={`vintage-chip ${toneCls} ${className}`.trim()}>
      {dot && <span className="vintage-chip__dot" />}
      {children}
    </span>
  );
}

export function WaxStamp({ children }: { children: ReactNode }) {
  return <span className="wax-stamp">{children}</span>;
}

export function PageHeader({
  stamp,
  title,
  sub,
  right,
}: {
  stamp: string;
  title: string;
  sub?: string;
  right?: ReactNode;
}) {
  return (
    <header className="rg-page-header rg-fade-up">
      <div className="rg-page-header__stamp-row flex items-c justify-b">
        <div className="flex items-c gap-3">
          <Stamp>{stamp}</Stamp>
          <span className="t-stamp">/</span>
          <Stamp className="ink-soft">{title}</Stamp>
        </div>
        {right}
      </div>
      <h1 className="rg-page-header__title">{title}</h1>
      {sub && <p className="rg-page-header__sub">{sub}</p>}
      <hr className="ink-rule ink-rule--tight" />
    </header>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <div className="eyebrow">{children}</div>;
}
