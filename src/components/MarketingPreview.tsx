'use client';

import { useState } from 'react';

interface MarketingPreviewProps {
  platform: string;
  content: Record<string, string>;
  productName?: string;
}

export default function MarketingPreview({
  platform,
  content,
  productName,
}: MarketingPreviewProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [captionExpanded, setCaptionExpanded] = useState(false);

  const handleCopy = (key: string, value: string) => {
    navigator.clipboard.writeText(value);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const isTikTok = platform === 'tiktok';
  const caption = content.caption || '';
  const hashtags = content.hashtags || '';
  const brandName = productName || 'yourbrand';
  const handle = '@' + brandName.toLowerCase().replace(/\s+/g, '');

  const maxCaptionPreview = 90;
  const captionPreview = caption.length > maxCaptionPreview && !captionExpanded
    ? caption.substring(0, maxCaptionPreview) + '...'
    : caption;

  const shadow = 'drop-shadow(0 1px 3px rgba(0,0,0,0.5))';
  const textShadow = '0 1px 4px rgba(0,0,0,0.6)';

  const MediaBackground = () => (
    <div style={{
      position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
      background: isTikTok
        ? 'linear-gradient(145deg, #010101, #161823)'
        : 'linear-gradient(145deg, #1a1a2e, #16213e, #0f3460)',
    }} />
  );

  // ── TikTok UI Chrome ──
  const TikTokChrome = () => (
    <>
      <div style={{
        position: 'absolute', top: 50, left: 0, right: 0, padding: '0 16px',
        display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16, zIndex: 10,
      }}>
        <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 15, fontWeight: 600 }}>Following</span>
        <span style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.3)' }} />
        <span style={{ color: 'white', fontSize: 15, fontWeight: 700, textShadow }}>For You</span>
      </div>

      <div style={{ position: 'absolute', top: 50, right: 16, zIndex: 10 }}>
        <svg width="22" height="22" fill="none" stroke="white" strokeWidth="2" viewBox="0 0 24 24" style={{ filter: shadow }}>
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
      </div>

      <div style={{
        position: 'absolute', right: 12, bottom: 160,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, zIndex: 10,
      }}>
        <div style={{ position: 'relative', marginBottom: 8 }}>
          <div style={{
            width: 44, height: 44, borderRadius: '50%', border: '2px solid white',
            background: '#333', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, fontWeight: 700, color: 'white',
          }}>
            {brandName.charAt(0).toUpperCase()}
          </div>
          <div style={{
            position: 'absolute', bottom: -6, left: '50%', transform: 'translateX(-50%)',
            width: 18, height: 18, borderRadius: '50%', background: '#FE2C55',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ color: 'white', fontSize: 14, fontWeight: 700, lineHeight: 1 }}>+</span>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <svg width="30" height="30" fill="white" viewBox="0 0 24 24" style={{ filter: shadow }}>
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
          </svg>
          <span style={{ color: 'white', fontSize: 12, fontWeight: 600, textShadow }}>18.5K</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <svg width="28" height="28" fill="white" viewBox="0 0 24 24" style={{ filter: shadow }}>
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          <span style={{ color: 'white', fontSize: 12, fontWeight: 600, textShadow }}>342</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <svg width="26" height="26" fill="none" stroke="white" strokeWidth="2" viewBox="0 0 24 24" style={{ filter: shadow }}>
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
          </svg>
          <span style={{ color: 'white', fontSize: 12, fontWeight: 600, textShadow }}>Save</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <svg width="26" height="26" fill="white" viewBox="0 0 24 24" style={{ filter: shadow }}>
            <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13"/>
          </svg>
          <span style={{ color: 'white', fontSize: 12, fontWeight: 600, textShadow }}>Share</span>
        </div>
        <div style={{
          width: 36, height: 36, borderRadius: '50%',
          border: '3px solid rgba(255,255,255,0.3)',
          background: 'linear-gradient(135deg, #222, #444)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#fff' }} />
        </div>
      </div>

      <div style={{ position: 'absolute', bottom: 70, left: 0, right: 60, padding: '0 14px', zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ color: 'white', fontWeight: 700, fontSize: 14, textShadow }}>{handle}</span>
        </div>
        <div style={{ marginBottom: 6 }}>
          <span style={{ color: 'white', fontSize: 13, lineHeight: 1.4, textShadow, wordWrap: 'break-word', display: 'block' }}>
            {captionPreview}
            {caption.length > maxCaptionPreview && !captionExpanded && (
              <span onClick={() => setCaptionExpanded(true)} style={{ color: 'rgba(255,255,255,0.6)', cursor: 'pointer', marginLeft: 4 }}>more</span>
            )}
          </span>
        </div>
        {hashtags && (
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, lineHeight: 1.3, textShadow, margin: 0, overflow: 'hidden', maxHeight: captionExpanded ? 'none' : 36 }}>
            {hashtags}
          </p>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10 }}>
          <svg width="14" height="14" fill="white" viewBox="0 0 24 24"><path d="M9 18V5l12-2v13M9 18c0 1.66-1.34 3-3 3s-3-1.34-3-3 1.34-3 3-3 3 1.34 3 3zM21 16c0 1.66-1.34 3-3 3s-3-1.34-3-3 1.34-3 3-3 3 1.34 3 3z"/></svg>
          <span style={{ color: 'white', fontSize: 11, textShadow }}>Original Sound - {brandName}</span>
        </div>
      </div>

      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: 60,
        display: 'flex', alignItems: 'center', justifyContent: 'space-around', zIndex: 10,
        background: 'linear-gradient(to top, rgba(0,0,0,0.5), transparent)',
        paddingBottom: 6,
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <svg width="22" height="22" fill="white" viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
          <span style={{ color: 'white', fontSize: 10, fontWeight: 600 }}>Home</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <svg width="22" height="22" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10 }}>Discover</span>
        </div>
        <div style={{
          width: 44, height: 30, borderRadius: 8, position: 'relative', overflow: 'hidden',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ position: 'absolute', left: 0, width: '100%', height: '100%', borderRadius: 8, background: '#25F4EE' }} />
          <div style={{ position: 'absolute', right: 0, width: '100%', height: '100%', borderRadius: 8, background: '#FE2C55', marginLeft: 4 }} />
          <div style={{ position: 'relative', width: 36, height: 26, borderRadius: 6, background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 20, fontWeight: 300, color: '#000', lineHeight: 1 }}>+</span>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <svg width="22" height="22" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10 }}>Inbox</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#555', border: '1px solid rgba(255,255,255,0.5)' }} />
          <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10 }}>Me</span>
        </div>
      </div>
    </>
  );

  // ── Instagram UI Chrome ──
  const InstagramChrome = () => (
    <>
      <div style={{
        position: 'absolute', top: 50, left: 0, right: 0, padding: '0 16px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 10,
      }}>
        <span style={{ color: 'white', fontWeight: 700, fontSize: 16, textShadow }}>Reels</span>
        <svg width="24" height="24" fill="none" stroke="white" strokeWidth="2" viewBox="0 0 24 24" style={{ filter: shadow }}>
          <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
          <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
        </svg>
      </div>

      <div style={{
        position: 'absolute', right: 12, bottom: 160,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, zIndex: 10,
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <svg width="28" height="28" fill="none" stroke="white" strokeWidth="2" viewBox="0 0 24 24" style={{ filter: shadow }}>
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
          </svg>
          <span style={{ color: 'white', fontSize: 12, fontWeight: 600, textShadow }}>4.2K</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <svg width="26" height="26" fill="none" stroke="white" strokeWidth="2" viewBox="0 0 24 24" style={{ filter: shadow }}>
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          <span style={{ color: 'white', fontSize: 12, fontWeight: 600, textShadow }}>128</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <svg width="26" height="26" fill="none" stroke="white" strokeWidth="2" viewBox="0 0 24 24" style={{ filter: shadow }}>
            <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
          <span style={{ color: 'white', fontSize: 12, fontWeight: 600, textShadow }}>Share</span>
        </div>
        <svg width="26" height="26" fill="none" stroke="white" strokeWidth="2" viewBox="0 0 24 24" style={{ filter: shadow }}>
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
        </svg>
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          border: '2px solid rgba(255,255,255,0.4)', background: 'linear-gradient(135deg, #667, #334)',
        }} />
      </div>

      <div style={{ position: 'absolute', bottom: 70, left: 0, right: 60, padding: '0 14px', zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, overflow: 'hidden' }}>
          <div style={{
            width: 32, height: 32, minWidth: 32, minHeight: 32, flexShrink: 0, borderRadius: '50%',
            background: 'linear-gradient(135deg, #405DE6, #5851DB, #833AB4, #C13584, #E1306C, #FD1D1D, #F56040, #FCAF45)',
            padding: 2,
          }}>
            <div style={{
              width: '100%', height: '100%', borderRadius: '50%', background: '#000',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 700, color: 'white',
            }}>
              {brandName.charAt(0).toUpperCase()}
            </div>
          </div>
          <span style={{
            color: 'white', fontWeight: 700, fontSize: 13, textShadow,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            minWidth: 0, flex: 1,
            maskImage: 'linear-gradient(to right, white 80%, transparent 100%)',
            WebkitMaskImage: 'linear-gradient(to right, white 80%, transparent 100%)',
          }}>
            {brandName.toLowerCase().replace(/\s+/g, '')}
          </span>
          <button style={{
            background: 'transparent', border: '1px solid rgba(255,255,255,0.7)',
            borderRadius: 8, padding: '4px 12px', color: 'white', fontSize: 12, fontWeight: 600,
            cursor: 'default', flexShrink: 0, whiteSpace: 'nowrap',
          }}>Follow</button>
        </div>
        <div style={{ marginBottom: 6 }}>
          <span style={{ color: 'white', fontSize: 13, lineHeight: 1.4, textShadow, wordWrap: 'break-word', display: 'block' }}>
            {captionExpanded ? caption : captionPreview}
            {caption.length > maxCaptionPreview && !captionExpanded && (
              <span onClick={() => setCaptionExpanded(true)} style={{ color: 'rgba(255,255,255,0.6)', cursor: 'pointer', marginLeft: 4 }}>more</span>
            )}
            {captionExpanded && (
              <span onClick={() => setCaptionExpanded(false)} style={{ color: 'rgba(255,255,255,0.6)', cursor: 'pointer', marginLeft: 4 }}>less</span>
            )}
          </span>
        </div>
        {hashtags && (
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, lineHeight: 1.3, textShadow, margin: 0, overflow: 'hidden', maxHeight: captionExpanded ? 'none' : 36 }}>
            {hashtags}
          </p>
        )}
      </div>

      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: 64,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-around', paddingTop: 10, zIndex: 10,
      }}>
        <svg width="24" height="24" fill="white" viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
        <svg width="24" height="24" fill="none" stroke="white" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <svg width="28" height="28" fill="none" stroke="white" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="3"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
        <svg width="24" height="24" fill="white" viewBox="0 0 24 24"><path d="M4 4h16a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2zm5 4l6 4-6 4V8z"/></svg>
        <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#555', border: '2px solid white' }} />
      </div>
    </>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
      <div style={{
        width: 375, maxWidth: '100%', background: '#000', borderRadius: 40,
        overflow: 'hidden', boxShadow: '0 25px 80px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.08)',
        position: 'relative', border: '4px solid #1a1a1a',
      }}>
        <div style={{
          position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)',
          width: 126, height: 36, background: '#000', borderRadius: 20, zIndex: 30,
        }} />
        <div style={{ position: 'relative', aspectRatio: '9/19.5', overflow: 'hidden', background: '#000' }}>
          <MediaBackground />
          {isTikTok ? <TikTokChrome /> : <InstagramChrome />}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, width: 375, maxWidth: '100%' }}>
        <button className="btn btn-primary" onClick={() => handleCopy('caption', `${caption}\n\n${hashtags}`)}
          style={{ flex: 1, justifyContent: 'center' }}>
          {copiedKey === 'caption' ? '✓ Copied!' : 'Copy Caption + Tags'}
        </button>
      </div>
    </div>
  );
}
