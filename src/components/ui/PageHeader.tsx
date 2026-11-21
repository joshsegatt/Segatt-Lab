"use client";

import React from "react";

interface PageHeaderProps {
  title: string;
  description?: string;
  children?: React.ReactNode;
  /** Kept for the screens that still pass it; v2 headers have one size. */
  compact?: boolean;
}

export function PageHeader({ title, description, children }: PageHeaderProps) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {description && <p className="description">{description}</p>}
      </div>
      {children && <div className="header-actions">{children}</div>}

      <style jsx>{`
        .page-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          gap: 24px;
          padding: 8px 0 20px;
        }
        h1 {
          font: 600 30px/1.2 var(--font-title);
          letter-spacing: -0.02em;
        }
        .description {
          margin-top: 6px;
          color: var(--ink-2);
          max-width: 60ch;
        }
        .header-actions {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
      `}</style>
    </header>
  );
}
