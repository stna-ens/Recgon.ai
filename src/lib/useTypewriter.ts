'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * ChatGPT-style smooth typewriter reveal.
 *
 * The component feeds in the *full* assistant text accumulated so far
 * (`fullText`) plus whether the network stream has ended (`isStreamDone`).
 * This hook reveals that text character-by-character on a
 * requestAnimationFrame loop, returning the currently-visible prefix.
 *
 * The pacing decision is factored out into `charsThisFrame()` — a pure
 * function of (buffered chars remaining, isStreamDone) — so it can be
 * unit-tested without rAF or the DOM.
 */

export interface PaceConfig {
  /** Baseline chars/frame when buffer is nearly drained and still streaming. */
  baseline: number;
  /** Hard ceiling on chars/frame while streaming (buffer-pressure cap). */
  maxStreaming: number;
  /** Divisor: how many buffered chars map to +1 char/frame of pressure speedup. */
  pressureDivisor: number;
  /**
   * When the stream is done we want to flush fast. We aim to empty the buffer
   * within ~`flushFrames` frames. At 60fps, 24 frames ≈ 400ms.
   */
  flushFrames: number;
}

export const DEFAULT_PACE: PaceConfig = {
  baseline: 2,
  maxStreaming: 14,
  pressureDivisor: 28,
  flushFrames: 24,
};

/**
 * Pure pacing function: given how many characters are still buffered and
 * whether the stream has ended, decide how many characters to reveal this
 * frame.
 *
 * Invariants (covered by tests):
 *  - Never negative.
 *  - Always >= 1 when the buffer is non-empty (guarantees forward progress).
 *  - 0 only when the buffer is empty.
 *  - While streaming: scales up with buffer pressure, capped at maxStreaming,
 *    so the reveal never lags far behind the model, but stays near `baseline`
 *    when the buffer is small (steady, readable pace).
 *  - When done: fast ramp that empties the buffer within ~flushFrames frames.
 */
export function charsThisFrame(
  remaining: number,
  isStreamDone: boolean,
  cfg: PaceConfig = DEFAULT_PACE,
): number {
  if (remaining <= 0) return 0;

  if (isStreamDone) {
    // Fast flush. Two terms, whichever is larger:
    //  - `ceil(remaining / flushFrames)` drains a large buffer aggressively
    //    (a buffer of size N is gone in ~flushFrames frames at this rate),
    //  - `maxStreaming` is a floor so the short tail never crawls.
    // For a typical reply (a few hundred chars) this clears within
    // ~flushFrames frames ≈ 400ms at 60fps; very long replies take a little
    // longer but still flush far faster than the steady streaming pace.
    return Math.max(Math.ceil(remaining / cfg.flushFrames), cfg.maxStreaming, 1);
  }

  // Steady, buffer-pressure-aware pace while the stream is still arriving.
  const pressure = Math.floor(remaining / cfg.pressureDivisor);
  const speed = cfg.baseline + pressure;
  return Math.min(Math.max(speed, 1), cfg.maxStreaming);
}

export interface UseTypewriterResult {
  /** The portion of `fullText` revealed so far. */
  visibleText: string;
  /** True while the reveal is still catching up to `fullText`. */
  isRevealing: boolean;
}

/**
 * rAF-driven reveal hook. `visibleText` advances toward `fullText` each frame
 * at a pace decided by `charsThisFrame`.
 *
 * Safety:
 *  - Cancels its rAF on unmount.
 *  - If `fullText` shrinks (e.g. a new message replaced the old turn, or an
 *    error rewrote the bubble), the visible prefix is reset/flushed so it
 *    never shows stale characters.
 */
export function useTypewriter(
  fullText: string,
  isStreamDone: boolean,
  cfg: PaceConfig = DEFAULT_PACE,
): UseTypewriterResult {
  const [revealedCount, setRevealedCount] = useState(0);
  const rafRef = useRef<number | null>(null);

  // Latest inputs, read inside the rAF loop without re-subscribing each frame.
  const fullTextRef = useRef(fullText);
  const doneRef = useRef(isStreamDone);
  const cfgRef = useRef(cfg);
  fullTextRef.current = fullText;
  doneRef.current = isStreamDone;
  cfgRef.current = cfg;

  // If the text we're revealing into changed shape — the new value is not a
  // superset of the prefix we've already shown (it got shorter, or an error /
  // new turn rewrote the bubble) — restart the reveal cleanly so we never
  // render a stale prefix. Done in an effect to avoid setState during render.
  const shownPrefixRef = useRef('');
  useEffect(() => {
    const expected = shownPrefixRef.current;
    if (expected.length > 0 && !fullText.startsWith(expected)) {
      setRevealedCount(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullText]);

  useEffect(() => {
    const tick = () => {
      const full = fullTextRef.current;
      const done = doneRef.current;
      setRevealedCount((count) => {
        const remaining = full.length - count;
        if (remaining <= 0) {
          rafRef.current = null;
          return count;
        }
        const step = charsThisFrame(remaining, done, cfgRef.current);
        const next = Math.min(count + step, full.length);
        if (next < full.length) {
          rafRef.current = requestAnimationFrame(tick);
        } else {
          rafRef.current = null;
        }
        return next;
      });
    };

    // Kick the loop whenever there is unrevealed text and no loop running.
    if (rafRef.current == null && revealedCount < fullText.length) {
      rafRef.current = requestAnimationFrame(tick);
    }

    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [fullText, isStreamDone, revealedCount]);

  // Cancel on unmount (belt-and-suspenders; the effect cleanup also covers it).
  useEffect(
    () => () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    },
    [],
  );

  const visibleText = fullText.slice(0, revealedCount);
  shownPrefixRef.current = visibleText;
  return { visibleText, isRevealing: revealedCount < fullText.length };
}

/** Flush helper exported for callers that want to force-complete a reveal. */
export function fullyRevealed(fullText: string): UseTypewriterResult {
  return { visibleText: fullText, isRevealing: false };
}
