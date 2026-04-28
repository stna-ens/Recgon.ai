'use client';

import { useRef, useEffect } from 'react';

interface LetterGlitchProps {
  glitchColors?: string[];
  glitchSpeed?: number;
  centerVignette?: boolean;
  outerVignette?: boolean;
  smooth?: boolean;
  characters?: string;
  className?: string;
}

export default function LetterGlitch({
  glitchColors = ['#2b4539', '#61dca3', '#61b3dc'],
  glitchSpeed = 50,
  centerVignette = false,
  outerVignette = true,
  smooth = true,
  characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ!@#$&*()-_+=/[]{};:<>.,0123456789',
  className = '',
}: LetterGlitchProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const letters = useRef<{ char: string; color: string; targetColor: string; colorProgress: number }[]>([]);
  const grid = useRef({ columns: 0, rows: 0 });
  const context = useRef<CanvasRenderingContext2D | null>(null);
  const lastGlitchTime = useRef(Date.now());

  const lettersAndSymbols = Array.from(characters);
  const fontSize = 16;
  const charWidth = 10;
  const charHeight = 20;

  const getRandomChar = () => lettersAndSymbols[Math.floor(Math.random() * lettersAndSymbols.length)];
  const getRandomColor = () => glitchColors[Math.floor(Math.random() * glitchColors.length)];

  const hexToRgb = (hex: string) => {
    const shorthand = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
    hex = hex.replace(shorthand, (_m, r, g, b) => r + r + g + g + b + b);
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) } : null;
  };

  const interpolateColor = (start: { r: number; g: number; b: number }, end: { r: number; g: number; b: number }, factor: number) => {
    return `rgb(${Math.round(start.r + (end.r - start.r) * factor)}, ${Math.round(start.g + (end.g - start.g) * factor)}, ${Math.round(start.b + (end.b - start.b) * factor)})`;
  };

  const initializeLetters = (columns: number, rows: number) => {
    grid.current = { columns, rows };
    letters.current = Array.from({ length: columns * rows }, () => ({
      char: getRandomChar(),
      color: getRandomColor(),
      targetColor: getRandomColor(),
      colorProgress: 1,
    }));
  };

  const drawLetters = () => {
    if (!context.current || !canvasRef.current || letters.current.length === 0) return;
    const ctx = context.current;
    const { width, height } = canvasRef.current.getBoundingClientRect();
    ctx.clearRect(0, 0, width, height);
    ctx.font = `${fontSize}px monospace`;
    ctx.textBaseline = 'top';
    letters.current.forEach((letter, index) => {
      const x = (index % grid.current.columns) * charWidth;
      const y = Math.floor(index / grid.current.columns) * charHeight;
      ctx.fillStyle = letter.color;
      ctx.fillText(letter.char, x, y);
    });
  };

  const resizeCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = parent.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    if (context.current) context.current.setTransform(dpr, 0, 0, dpr, 0, 0);
    const columns = Math.ceil(rect.width / charWidth);
    const rows = Math.ceil(rect.height / charHeight);
    initializeLetters(columns, rows);
    drawLetters();
  };

  const updateLetters = () => {
    const updateCount = Math.max(1, Math.floor(letters.current.length * 0.05));
    for (let i = 0; i < updateCount; i++) {
      const index = Math.floor(Math.random() * letters.current.length);
      if (!letters.current[index]) continue;
      letters.current[index].char = getRandomChar();
      letters.current[index].targetColor = getRandomColor();
      if (!smooth) {
        letters.current[index].color = letters.current[index].targetColor;
        letters.current[index].colorProgress = 1;
      } else {
        letters.current[index].colorProgress = 0;
      }
    }
  };

  const handleSmoothTransitions = () => {
    let needsRedraw = false;
    letters.current.forEach(letter => {
      if (letter.colorProgress < 1) {
        letter.colorProgress = Math.min(1, letter.colorProgress + 0.05);
        const startRgb = hexToRgb(letter.color);
        const endRgb = hexToRgb(letter.targetColor);
        if (startRgb && endRgb) {
          letter.color = interpolateColor(startRgb, endRgb, letter.colorProgress);
          needsRedraw = true;
        }
      }
    });
    if (needsRedraw) drawLetters();
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    context.current = canvas.getContext('2d');
    resizeCanvas();

    let lastTime = Date.now();
    const animate = () => {
      const now = Date.now();
      if (now - lastTime >= glitchSpeed) {
        updateLetters();
        drawLetters();
        lastTime = now;
      }
      if (smooth) handleSmoothTransitions();
      animationRef.current = requestAnimationFrame(animate);
    };
    animate();

    let resizeTimeout: ReturnType<typeof setTimeout>;
    const handleResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        cancelAnimationFrame(animationRef.current);
        resizeCanvas();
        animate();
      }, 100);
    };
    window.addEventListener('resize', handleResize);
    return () => {
      cancelAnimationFrame(animationRef.current);
      window.removeEventListener('resize', handleResize);
    };
  }, [glitchSpeed, smooth]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', backgroundColor: '#000', overflow: 'hidden' }} className={className}>
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
      {outerVignette && (
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'radial-gradient(circle, rgba(0,0,0,0) 40%, rgba(0,0,0,1) 100%)' }} />
      )}
      {centerVignette && (
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'radial-gradient(circle, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0) 60%)' }} />
      )}
    </div>
  );
}
