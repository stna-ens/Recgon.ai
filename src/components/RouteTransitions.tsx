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
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (reduce.matches) return;

    // CSS fallback path — when the View Transitions API is unavailable, we
    // still want navigations to feel polished. Replay the page-fade-in
    // animation on the <main> element after each route change. This is wired
    // up via a MutationObserver-free approach: we rely on Next router pushing
    // the new tree, then re-trigger the animation by toggling the class.
    const supportsVT = typeof docVT.startViewTransition === 'function';

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
      if (supportsVT) {
        docVT.startViewTransition!(() => {
          router.push(href);
        });
      } else {
        // Fallback: navigate, then replay page-fade-in on <main>.
        router.push(href);
        const main = document.querySelector<HTMLElement>('main.main-content');
        if (main) {
          main.classList.remove('page-fade-in');
          // Force reflow to restart the animation.
          void main.offsetWidth;
          main.classList.add('page-fade-in');
        }
      }
    };

    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [router]);

  return null;
}
