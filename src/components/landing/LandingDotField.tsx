'use client';

import { useEffect, useRef } from 'react';

type Mode = 'parent' | 'window';

interface Props {
  mode?: Mode;
  spacing?: number;
  reach?: number;
  /** Override `--dot-base-a` for this instance (0–1). Useful when the global
   *  token is tuned for a dense-card backdrop and the landing needs the dots
   *  more visible at rest on a sparse, deep background. */
  baseAlpha?: number;
  /** Override the dot radius at rest. */
  baseRadius?: number;
  /** Override the dot radius at peak (under the cursor). */
  maxRadius?: number;
  /** Autonomously animate a virtual cursor along a Lissajous path so the
   *  field stays "alive" on mobile / without input. Real pointer input still
   *  takes over while active and falls back to roam after ~1.2s idle. */
  autoRoam?: boolean;
  /** Ignore pointer input entirely — autoRoam drives unconditionally. Use on
   *  mobile / hero backdrops where taps and scrolls shouldn't yank the field
   *  out of its idle motion. */
  ignorePointer?: boolean;
}

export default function LandingDotField({
  mode = 'parent',
  spacing = 18,
  reach = 120,
  baseAlpha,
  baseRadius = 0.9,
  maxRadius = 3,
  autoRoam = false,
  ignorePointer = false,
}: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    let raf = 0;
    let mx = -9999, my = -9999;
    let tx = -9999, ty = -9999;
    let lastPointerAt = -Infinity;
    const startedAt = (typeof performance !== 'undefined' ? performance.now() : 0);
    // Visibility / viewport gates — skip per-frame work when there's no one
    // looking. A canvas off-screen or in a hidden tab shouldn't be burning
    // GPU/CPU on a 60fps loop, especially since this component now also
    // mounts inside the logged-in app shell (HomeFocus).
    let visible = typeof document === 'undefined' || !document.hidden;
    let onScreen = true;
    let running = false;

    const BASE_R = baseRadius;
    const MAX_R = maxRadius;
    const MAX_A = 1;
    const PUSH_MAX = 14;

    // Resize the canvas to match its parent's current size. Reading
    // getBoundingClientRect on the parent (not the canvas) is the safe move:
    // once we set explicit pixel `style.width/height` on the canvas, its own
    // ResizeObserver stops firing when the parent grows. Observing the parent
    // sidesteps that — and also catches viewport / vh changes.
    const parent = c.parentElement;
    const measureTarget: HTMLElement = parent ?? c;
    const resize = () => {
      const r = measureTarget.getBoundingClientRect();
      const w = r.width;
      const h = r.height;
      c.width = Math.max(1, Math.round(w * dpr));
      c.height = Math.max(1, Math.round(h * dpr));
      c.style.width = `${w}px`;
      c.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(measureTarget);
    // Window resize also matters when the parent is sized in vh and the
    // viewport changes (e.g. mobile address bar collapse). ResizeObserver on
    // the parent covers most cases, but a window listener is a cheap belt.
    window.addEventListener('resize', resize);

    const target: HTMLElement | Window | null =
      mode === 'window'
        ? window
        : c.parentElement?.parentElement ?? c.parentElement ?? null;

    const onMove = (e: Event) => {
      const pe = e as PointerEvent;
      const r = c.getBoundingClientRect();
      mx = pe.clientX - r.left;
      my = pe.clientY - r.top;
      lastPointerAt = (typeof performance !== 'undefined' ? performance.now() : 0);
    };
    const onLeave = () => { mx = -9999; my = -9999; };

    // Idle threshold before autoRoam reclaims the cursor.
    const POINTER_IDLE_MS = 1200;

    if (!ignorePointer) {
      target?.addEventListener('pointermove', onMove as EventListener);
      target?.addEventListener('pointerleave', onLeave as EventListener);
    }

    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    const rootStyle = getComputedStyle(document.documentElement);
    const readDotRgb = () =>
      rootStyle.getPropertyValue('--dot-rgb').trim() ||
      rootStyle.getPropertyValue('--signature-rgb').trim() ||
      '236, 72, 153';
    const readBaseA = () => {
      if (typeof baseAlpha === 'number') return baseAlpha;
      const v = parseFloat(rootStyle.getPropertyValue('--dot-base-a'));
      return Number.isFinite(v) ? v : 0.26;
    };
    // Cache CSS reads — getComputedStyle is non-trivial and these tokens
    // only change on theme switch. Re-read once a second; cheap enough to
    // catch theme flips without paying for it 60×/sec.
    let cachedSig = readDotRgb();
    let cachedBaseA = readBaseA();
    let lastStyleRead = (typeof performance !== 'undefined' ? performance.now() : 0);
    const STYLE_REFRESH_MS = 1000;

    const drawStatic = () => {
      cachedSig = readDotRgb();
      cachedBaseA = readBaseA();
      const w = c.clientWidth;
      const h = c.clientHeight;
      ctx.clearRect(0, 0, w, h);
      const cols = Math.floor(w / spacing);
      const rows = Math.floor(h / spacing);
      const offX = (w - (cols - 1) * spacing) / 2;
      const offY = (h - (rows - 1) * spacing) / 2;
      ctx.fillStyle = `rgba(${cachedSig}, ${cachedBaseA})`;
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          ctx.beginPath();
          ctx.arc(offX + col * spacing, offY + row * spacing, BASE_R, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };

    const draw = () => {
      raf = 0;
      // Bail without scheduling another frame if nothing is visible. The
      // visibility / intersection handlers will call start() again when the
      // canvas becomes observable; until then we don't burn cycles.
      if (!visible || !onScreen) {
        running = false;
        return;
      }

      const tNow = (typeof performance !== 'undefined' ? performance.now() : 0);
      // When autoRoam is on and the user isn't actively touching, drive a
      // virtual cursor along a slow Lissajous path so the field breathes.
      // Real pointer input wins for POINTER_IDLE_MS, then roam takes over.
      if (autoRoam && tNow - lastPointerAt > POINTER_IDLE_MS) {
        const w = c.clientWidth;
        const h = c.clientHeight;
        const elapsed = (tNow - startedAt) / 1000;
        const cx = w * 0.5;
        const cy = h * 0.55;
        // Keep the virtual cursor well clear of the canvas edges so the
        // lensing hotspot never grazes the viewport — about 60% of the
        // half-width is the sweet spot: still feels roomy, never escapes.
        const rx = w * 0.28;
        const ry = h * 0.22;
        mx = cx + Math.sin(elapsed * 0.32) * rx + Math.sin(elapsed * 0.17) * (rx * 0.18);
        my = cy + Math.cos(elapsed * 0.41) * ry + Math.cos(elapsed * 0.11) * (ry * 0.22);
      }

      // Settle the cursor toward the target position. After enough idle
      // frames with no input AND a stable position, freeze the loop and
      // wait for the next pointermove — the static frame is identical to
      // what we'd keep redrawing, so there's no point at 60fps.
      tx += (mx - tx) * 0.25;
      ty += (my - ty) * 0.25;

      // Refresh CSS reads occasionally (theme switch) — not every frame.
      const now = (typeof performance !== 'undefined' ? performance.now() : 0);
      if (now - lastStyleRead > STYLE_REFRESH_MS) {
        cachedSig = readDotRgb();
        cachedBaseA = readBaseA();
        lastStyleRead = now;
      }
      const sig = cachedSig;
      const BASE_A = cachedBaseA;

      const w = c.clientWidth;
      const h = c.clientHeight;
      ctx.clearRect(0, 0, w, h);

      const cols = Math.floor(w / spacing);
      const rows = Math.floor(h / spacing);
      const offX = (w - (cols - 1) * spacing) / 2;
      const offY = (h - (rows - 1) * spacing) / 2;

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const x = offX + col * spacing;
          const y = offY + row * spacing;
          const dx = x - tx;
          const dy = y - ty;
          const d = Math.hypot(dx, dy);
          let t = 0;
          if (d < reach) {
            const u = 1 - d / reach;
            t = u * u * (3 - 2 * u);
          }
          const safeD = d || 0.0001;
          const ux = dx / safeD;
          const uy = dy / safeD;
          const r = BASE_R + (MAX_R - BASE_R) * t;
          const a = BASE_A + (MAX_A - BASE_A) * t;
          const px = x + ux * PUSH_MAX * t;
          const py = y + uy * PUSH_MAX * t;
          // Skip any dot whose pushed position would land outside the
          // canvas. Clamping created edge-clusters; skipping just lets
          // those dots disappear cleanly.
          if (px < r || px > w - r || py < r || py > h - r) continue;
          ctx.fillStyle = `rgba(${sig}, ${a})`;
          ctx.beginPath();
          ctx.arc(px, py, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Stop the loop once the cursor is gone and the easing has settled —
      // keeps the static dot grid on screen without paying for it. A
      // pointermove restarts via onMove → start(). With autoRoam, the loop
      // is never idle (mx is constantly updated above), so it keeps running.
      const idle = mx === -9999;
      const settled = Math.abs(mx - tx) < 0.5 && Math.abs(my - ty) < 0.5;
      if (idle && settled && !autoRoam) {
        running = false;
        return;
      }
      raf = requestAnimationFrame(draw);
    };

    const start = () => {
      if (running || reduce) return;
      if (!visible || !onScreen) return;
      running = true;
      raf = requestAnimationFrame(draw);
    };
    const stop = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      running = false;
    };

    // Restart the loop whenever a new pointer event arrives — `onMove` is
    // already declared above; wrap it to also kick the loop awake.
    const wrappedMove = (e: Event) => {
      onMove(e);
      start();
    };
    if (!ignorePointer) {
      target?.removeEventListener('pointermove', onMove as EventListener);
      target?.addEventListener('pointermove', wrappedMove);
    }

    // Pause whenever the tab is hidden. setInterval/rAF still fire in some
    // browsers (throttled), but we don't want to be in the work-doing path.
    const onVisibility = () => {
      visible = !document.hidden;
      if (visible) start();
      else stop();
    };
    document.addEventListener('visibilitychange', onVisibility);

    // Pause whenever the canvas is scrolled out of view. The HomeFocus
    // mount in particular sits well below the fold most of the time.
    let io: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== 'undefined') {
      io = new IntersectionObserver(
        (entries) => {
          const e = entries[0];
          if (!e) return;
          onScreen = e.isIntersecting;
          if (onScreen) start();
          else stop();
        },
        { rootMargin: '64px' },
      );
      io.observe(c);
    }

    if (reduce) {
      drawStatic();
    } else {
      start();
    }

    return () => {
      stop();
      ro.disconnect();
      io?.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('resize', resize);
      if (!ignorePointer) {
        target?.removeEventListener('pointermove', wrappedMove);
        target?.removeEventListener('pointerleave', onLeave as EventListener);
      }
    };
  }, [mode, spacing, reach, baseAlpha, baseRadius, maxRadius, autoRoam, ignorePointer]);

  return <canvas ref={ref} className="v2-fc-canvas" aria-hidden="true" />;
}
