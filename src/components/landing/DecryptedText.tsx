'use client';

import { useEffect, useState, useRef, useMemo, useCallback } from 'react';

interface DecryptedTextProps {
  text: string;
  speed?: number;
  maxIterations?: number;
  sequential?: boolean;
  revealDirection?: 'start' | 'end' | 'center';
  useOriginalCharsOnly?: boolean;
  characters?: string;
  className?: string;
  parentClassName?: string;
  encryptedClassName?: string;
  animateOn?: 'hover' | 'view' | 'click' | 'inViewHover';
  clickMode?: 'once' | 'toggle';
  onComplete?: () => void;
}

export default function DecryptedText({
  text,
  speed = 50,
  maxIterations = 10,
  sequential = false,
  revealDirection = 'start',
  useOriginalCharsOnly = false,
  characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+<>[]{}',
  className = '',
  parentClassName = '',
  encryptedClassName = '',
  animateOn = 'view',
  onComplete,
}: DecryptedTextProps) {
  const [displayText, setDisplayText] = useState(text);
  const [isAnimating, setIsAnimating] = useState(false);
  const [revealedIndices, setRevealedIndices] = useState(new Set<number>());
  const [hasAnimated, setHasAnimated] = useState(false);
  const [isDecrypted, setIsDecrypted] = useState(animateOn !== 'click');

  const containerRef = useRef<HTMLSpanElement>(null);

  const availableChars = useMemo(
    () =>
      useOriginalCharsOnly
        ? Array.from(new Set(text.split(''))).filter((c) => c !== ' ')
        : characters.split(''),
    [useOriginalCharsOnly, text, characters]
  );

  const shuffleText = useCallback(
    (original: string, revealed: Set<number>) =>
      original
        .split('')
        .map((char, i) => {
          if (char === ' ') return ' ';
          if (revealed.has(i)) return original[i];
          return availableChars[Math.floor(Math.random() * availableChars.length)];
        })
        .join(''),
    [availableChars]
  );

  const triggerDecrypt = useCallback(() => {
    setRevealedIndices(new Set());
    setIsAnimating(true);
  }, []);

  useEffect(() => {
    if (!isAnimating) return;
    let currentIteration = 0;
    let revealed = new Set<number>();

    const interval = setInterval(() => {
      if (sequential) {
        if (revealed.size < text.length) {
          const next = new Set(revealed);
          let idx = revealed.size;
          if (revealDirection === 'end') idx = text.length - 1 - revealed.size;
          next.add(idx);
          revealed = next;
          setRevealedIndices(next);
          setDisplayText(shuffleText(text, next));
        } else {
          clearInterval(interval);
          setIsAnimating(false);
          setIsDecrypted(true);
          setDisplayText(text);
          // Defer parent-setState so it doesn't run during this render commit.
          if (onComplete) queueMicrotask(onComplete);
        }
      } else {
        setDisplayText(shuffleText(text, revealed));
        currentIteration++;
        if (currentIteration >= maxIterations) {
          clearInterval(interval);
          setIsAnimating(false);
          setIsDecrypted(true);
          setDisplayText(text);
          if (onComplete) queueMicrotask(onComplete);
        }
      }
    }, speed);

    return () => clearInterval(interval);
  }, [isAnimating, text, speed, maxIterations, sequential, revealDirection, shuffleText, onComplete]);

  useEffect(() => {
    if (animateOn !== 'view') return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated) {
          triggerDecrypt();
          setHasAnimated(true);
        }
      },
      { threshold: 0.1 }
    );
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [animateOn, hasAnimated, triggerDecrypt]);

  useEffect(() => {
    setDisplayText(text);
    setIsDecrypted(true);
  }, [text]);

  return (
    <span
      ref={containerRef}
      className={parentClassName}
      style={{ display: 'inline', whiteSpace: 'pre-wrap' }}
    >
      <span aria-hidden="true">
        {displayText.split('').map((char, i) => {
          const revealed = revealedIndices.has(i) || (!isAnimating && isDecrypted);
          return (
            <span key={i} className={revealed ? className : encryptedClassName}>
              {char}
            </span>
          );
        })}
      </span>
    </span>
  );
}
