'use client';

interface Props {
  idx: string;
  label: string;
  sub?: string;
}

export default function SectionIndex({ idx, label, sub }: Props) {
  return (
    <div className="v2-sec-idx">
      <span className="v2-sec-idx-num">{idx}</span>
      <span className="v2-sec-idx-lab">{label}</span>
      {sub && <span className="v2-sec-idx-sub">{sub}</span>}
    </div>
  );
}
