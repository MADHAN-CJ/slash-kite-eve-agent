'use client';

import { type RefObject, useEffect } from 'react';

const FOCUSABLE = 'button:not(:disabled),a[href],input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex]:not([tabindex="-1"])';

/**
 * Keeps Tab / Shift+Tab inside an open dialog and returns focus to where it was
 * when the dialog closes (plan-v2 V12 a11y pass). Escape is left to the caller.
 */
export function useFocusTrap(root: RefObject<HTMLElement | null>, open: boolean, initial?: string) {
  useEffect(() => {
    if (!open) return;
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const first = initial ? root.current?.querySelector<HTMLElement>(initial) : null;
    (first ?? root.current?.querySelector<HTMLElement>(FOCUSABLE))?.focus({ preventScroll: true });
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !root.current) return;
      const controls = Array.from(root.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.getClientRects().length);
      const head = controls[0];
      const tail = controls.at(-1);
      if (!head || !tail) return;
      const inside = root.current.contains(document.activeElement);
      if (!inside || (e.shiftKey && document.activeElement === head)) {
        e.preventDefault();
        (e.shiftKey ? tail : head).focus();
      } else if (!e.shiftKey && document.activeElement === tail) {
        e.preventDefault();
        head.focus();
      }
    };
    document.addEventListener('keydown', key, true);
    return () => {
      document.removeEventListener('keydown', key, true);
      before?.focus({ preventScroll: true });
    };
  }, [root, open, initial]);
}
