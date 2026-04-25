'use client';

/**
 * RouteTransitions — wraps Next.js client navigations in document.startViewTransition()
 * so the cross-fade defined in globals.css (::view-transition-old/new(root)) plays on
 * every internal route change. Mounted once at the app root by AppShell.
 *
 * Strategy: capture-phase click listener on the document. If the click is on an
 * internal <a href="/..."> with no modifiers / target="_blank" / download, we
 * preventDefault and route via Next's router inside the view-transition wrapper.
 *
 * Falls back to native navigation if the browser lacks startViewTransition,
 * or if the user has prefers-reduced-motion.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

type DocVT = Document & {
  startViewTransition?: (cb: () => void | Promise<void>) => unknown;
};

export default function RouteTransitions() {
  const router = useRouter();

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const docVT = document as DocVT;
    if (typeof docVT.startViewTransition !== 'function') return;

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (reduce.matches) return;

    const onClick = (e: MouseEvent) => {
      // Only handle plain left-clicks
      if (e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (e.defaultPrevented) return;

      const anchor = (e.target as HTMLElement | null)?.closest?.('a');
      if (!anchor) return;

      const href = anchor.getAttribute('href');
      if (!href) return;

      // Internal same-origin navigation only
      if (!href.startsWith('/') || href.startsWith('//')) return;
      if (anchor.target && anchor.target !== '' && anchor.target !== '_self') return;
      if (anchor.hasAttribute('download')) return;
      if (anchor.dataset.noTransition === 'true') return;

      // Same-page hash: let the browser handle smooth-scroll
      const url = new URL(href, window.location.origin);
      if (
        url.pathname === window.location.pathname &&
        url.search === window.location.search &&
        url.hash
      ) {
        return;
      }

      e.preventDefault();
      docVT.startViewTransition!(() => {
        router.push(href);
      });
    };

    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [router]);

  return null;
}
