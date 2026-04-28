'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  style?: React.CSSProperties;
  size?: 'sm' | 'md';
}

export default function Select({ value, onChange, options, placeholder, style, size = 'md' }: SelectProps) {
  const sm = size === 'sm';
  const [open, setOpen] = useState(false);
  const [dropdownRect, setDropdownRect] = useState<DOMRect | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);

  // Position the portal dropdown under the trigger
  const updateRect = () => {
    if (triggerRef.current) {
      setDropdownRect(triggerRef.current.getBoundingClientRect());
    }
  };

  const handleOpen = () => {
    updateRect();
    setOpen((v) => !v);
  };

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (
        triggerRef.current && !triggerRef.current.contains(target) &&
        dropdownRef.current && !dropdownRef.current.contains(target)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Reposition on scroll/resize
  useEffect(() => {
    if (!open) return;
    const handleScroll = () => updateRect();
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleScroll);
    return () => {
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleScroll);
    };
  }, [open]);

  return (
    <div style={{ position: 'relative', ...style }}>
      {/* Trigger */}
      <button
        ref={triggerRef}
        type="button"
        onClick={handleOpen}
        style={{
          width: '100%',
          padding: sm ? '6px 10px' : '14px 20px',
          background: sm ? 'var(--btn-secondary-bg)' : 'var(--bg-deep)',
          border: '1px solid var(--btn-secondary-border)',
          borderRadius: 'var(--r-sm)',
          color: selected ? 'var(--txt-pure)' : 'var(--txt-faint)',
          fontFamily: 'inherit',
          fontSize: sm ? 12 : 15,
          fontWeight: sm ? 500 : 500,
          letterSpacing: sm ? 0 : '-0.3px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: sm ? 6 : 12,
          textAlign: 'left',
          outline: 'none',
          boxShadow: open
            ? `0 0 0 ${sm ? 2 : 4}px rgba(var(--signature-rgb), 0.12)`
            : sm ? 'none' : 'inset 0 2px 4px rgba(0,0,0,0.03)',
          borderColor: open ? 'rgba(var(--signature-rgb), 0.45)' : undefined,
          transition: 'box-shadow 0.2s ease, border-color 0.2s ease',
        }}
        onMouseEnter={(e) => {
          if (!open) {
            e.currentTarget.style.borderColor = 'rgba(var(--signature-rgb), 0.45)';
            if (sm) {
              e.currentTarget.style.boxShadow = '0 0 0 2px rgba(var(--signature-rgb), 0.08)';
            } else {
              e.currentTarget.style.boxShadow = '0 0 0 3px rgba(var(--signature-rgb), 0.1), 0 8px 24px rgba(var(--signature-rgb), 0.12), inset 0 1px 0 rgba(255,255,255,0.15)';
              e.currentTarget.style.transform = 'translateY(-1px)';
            }
          }
        }}
        onMouseLeave={(e) => {
          if (!open) {
            e.currentTarget.style.borderColor = '';
            e.currentTarget.style.boxShadow = sm ? 'none' : 'inset 0 2px 4px rgba(0,0,0,0.03)';
            e.currentTarget.style.transform = '';
          }
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected ? selected.label : (placeholder ?? 'Select...')}
        </span>
        <svg
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          viewBox="0 0 24 24"
          style={{
            flexShrink: 0,
            opacity: 0.5,
            transform: open ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {/* Dropdown rendered in a portal to escape overflow:hidden parents */}
      {open && dropdownRect && typeof document !== 'undefined' && createPortal(
        <div
          ref={dropdownRef}
          style={{
            position: 'fixed',
            top: dropdownRect.bottom + 4,
            left: dropdownRect.left,
            width: dropdownRect.width,
            background: 'var(--glass-substrate)',
            backdropFilter: 'blur(40px) saturate(180%)',
            WebkitBackdropFilter: 'blur(40px) saturate(180%)',
            border: '1px solid var(--btn-secondary-border)',
            borderRadius: 'var(--r-sm)',
            boxShadow: 'var(--shadow-deep)',
            zIndex: 99999,
            overflow: 'hidden',
            animation: 'selectDropdownOpen 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          {options.map((opt, i) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false); }}
              style={{
                width: '100%',
                padding: sm ? '7px 12px' : '11px 20px',
                background: opt.value === value ? 'rgba(var(--signature-rgb), 0.07)' : 'transparent',
                border: 'none',
                borderTop: i > 0 ? '1px solid var(--btn-secondary-border)' : 'none',
                borderLeft: opt.value === value ? '2px solid var(--signature)' : '2px solid transparent',
                color: opt.value === value ? 'var(--signature)' : 'var(--txt-muted)',
                fontFamily: 'inherit',
                fontSize: sm ? 12 : 14,
                fontWeight: opt.value === value ? 600 : 400,
                letterSpacing: sm ? 0 : '-0.2px',
                cursor: 'pointer',
                textAlign: 'left',
                display: 'flex',
                alignItems: 'center',
                gap: sm ? 6 : 10,
                transition: 'background 0.15s ease, color 0.15s ease',
              }}
              onMouseEnter={(e) => {
                if (opt.value !== value) {
                  (e.currentTarget as HTMLButtonElement).style.background = 'rgba(var(--signature-rgb), 0.07)';
                  (e.currentTarget as HTMLButtonElement).style.color = 'var(--txt-pure)';
                }
              }}
              onMouseLeave={(e) => {
                if (opt.value !== value) {
                  (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                  (e.currentTarget as HTMLButtonElement).style.color = 'var(--txt-muted)';
                }
              }}
            >
              {opt.value === value && (
                <svg width={sm ? 10 : 12} height={sm ? 10 : 12} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" style={{ flexShrink: 0, opacity: 0.7 }}>
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
              <span style={{ marginLeft: opt.value === value ? 0 : (sm ? 16 : 22) }}>{opt.label}</span>
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}
