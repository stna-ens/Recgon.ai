export interface EmptyStateProps {
  /** Unicode glyph or small element (no emojis). */
  icon?: React.ReactNode;
  title: string;
  description?: string;
  /** Usually a <Button> CTA. */
  action?: React.ReactNode;
  /** Tighter padding for sidebars / small panels. */
  compact?: boolean;
  className?: string;
}

/**
 * Shared empty state — always tells the user what this space is for and,
 * where possible, what to do next. Styles: `.ui-empty` in globals.css.
 */
export function EmptyState({ icon, title, description, action, compact, className }: EmptyStateProps) {
  const cls = ['ui-empty', compact ? 'ui-empty--compact' : '', className]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={cls} role="status">
      {icon != null && (
        <div className="ui-empty-icon" aria-hidden="true">
          {icon}
        </div>
      )}
      <div className="ui-empty-title">{title}</div>
      {description && <div className="ui-empty-desc">{description}</div>}
      {action && <div className="ui-empty-action">{action}</div>}
    </div>
  );
}
