'use client';

interface StatsCardProps {
  icon: React.ReactNode;
  value: string | number;
  label: string;
}

export default function StatsCard({ icon, value, label }: StatsCardProps) {
  return (
    <div className="glass-card stat-card">
      <span className="stat-card-icon">{icon}</span>
      <div className="stat-card-value">{value}</div>
      <div className="stat-card-label">{label}</div>
    </div>
  );
}
