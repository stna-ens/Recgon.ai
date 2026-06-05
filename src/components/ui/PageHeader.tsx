import Link from 'next/link';
import { Fragment } from 'react';

export interface Crumb {
  label: string;
  href?: string;
}

export interface PageHeaderProps {
  title: string;
  /** Small uppercase mono label above the title (recgon-label style). */
  eyebrow?: string;
  description?: string;
  /** Right-aligned action area (usually <Button>s). */
  actions?: React.ReactNode;
  breadcrumbs?: Crumb[];
  className?: string;
}

/**
 * Standard page header: breadcrumbs · eyebrow · title · description · actions.
 * Styles: `.ui-page-header` in globals.css.
 */
export function PageHeader({ title, eyebrow, description, actions, breadcrumbs, className }: PageHeaderProps) {
  return (
    <header className={['ui-page-header', className].filter(Boolean).join(' ')}>
      <div>
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav className="ui-breadcrumbs" aria-label="Breadcrumb">
            {breadcrumbs.map((crumb, i) => (
              <Fragment key={`${crumb.label}-${i}`}>
                {i > 0 && (
                  <span className="ui-crumb-sep" aria-hidden="true">
                    /
                  </span>
                )}
                {crumb.href ? (
                  <Link href={crumb.href}>{crumb.label}</Link>
                ) : (
                  <span className="ui-crumb-current" aria-current="page">
                    {crumb.label}
                  </span>
                )}
              </Fragment>
            ))}
          </nav>
        )}
        {eyebrow && <div className="ui-page-eyebrow">{eyebrow}</div>}
        <h1 className="ui-page-title">{title}</h1>
        {description && <p className="ui-page-desc">{description}</p>}
      </div>
      {actions && <div className="ui-page-actions">{actions}</div>}
    </header>
  );
}
