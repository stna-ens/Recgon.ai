import type { CampaignType } from './types';

interface Props {
  type: CampaignType;
  size?: number;
  color?: string;
}

export default function CampaignIcon({ type, size = 20, color }: Props) {
  const p = {
    width: size,
    height: size,
    fill: 'none',
    stroke: color ?? 'currentColor',
    strokeWidth: 1.75,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    viewBox: '0 0 24 24',
  };
  switch (type) {
    case 'product-launch':
      return (
        <svg {...p}>
          <path d="M12 2C8 6.5 6.5 10.5 6.5 14a5.5 5.5 0 0 0 11 0c0-3.5-1.5-7.5-5.5-12z" />
          <path d="M12 14v7" />
          <path d="M9 18.5 6 21" />
          <path d="M15 18.5 18 21" />
        </svg>
      );
    case 'brand-awareness':
      return (
        <svg {...p}>
          <path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9" />
          <path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5" />
          <circle cx="12" cy="12" r="2" />
          <path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5" />
          <path d="M19.1 4.9C23 8.8 23 15.2 19.1 19.1" />
        </svg>
      );
    case 'lead-generation':
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="6" />
          <circle cx="12" cy="12" r="2" />
        </svg>
      );
    case 'community-growth':
      return (
        <svg {...p}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case 're-engagement':
      return (
        <svg {...p}>
          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
          <path d="M3 3v5h5" />
        </svg>
      );
    case 'content-marketing':
      return (
        <svg {...p}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
      );
  }
}
