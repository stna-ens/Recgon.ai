import type { ReactNode } from 'react';

export function cleanText(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/\*\*/g, '')
    .replace(/__/g, '');
}

interface Props {
  text: string;
  bulletClassName?: string;
  bulletMarkClassName?: string;
  lineClassName?: string;
}

export default function MarkdownLine({
  text,
  bulletClassName = 'v2-mentor-bullet',
  bulletMarkClassName = 'v2-mentor-bullet-mark',
  lineClassName = 'v2-mentor-line',
}: Props) {
  const isBullet = /^[-*•]\s/.test(text);
  const inner = text.replace(/^[-*•]\s/, '');
  const parts: ReactNode[] = inner
    .split(/(\*\*.+?\*\*|\*[^*\s][^*]*\*)/g)
    .map((p, i) => {
      if (p.startsWith('**') && p.endsWith('**') && p.length > 4) {
        return (
          <strong key={i} style={{ color: 'var(--txt-pure)' }}>
            {p.slice(2, -2)}
          </strong>
        );
      }
      if (p.startsWith('*') && p.endsWith('*') && p.length > 2) {
        return <em key={i}>{p.slice(1, -1)}</em>;
      }
      return <span key={i}>{p}</span>;
    });

  if (text.trim() === '') return <div style={{ height: 8 }} />;

  if (isBullet) {
    return (
      <div className={bulletClassName}>
        <span className={bulletMarkClassName}>›</span>
        <span>{parts}</span>
      </div>
    );
  }
  return <div className={lineClassName}>{parts}</div>;
}
