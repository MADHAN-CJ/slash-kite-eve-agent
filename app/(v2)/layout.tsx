import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import '@/styles/v2/tokens.css';

/**
 * Root layout of the v2 UI (plan-v2-ui). It is a SEPARATE root from `(v1)`:
 * no Tailwind, no shadcn — v2 pages carry the prototype's own stylesheets, so
 * its selectors (`:root`, `html`, `body`, short class names) apply unchanged
 * and cannot collide with v1. Moving between the two roots is a full page load.
 */
export const metadata: Metadata = {
  title: '/markets',
  robots: { index: false },
};

export const viewport: Viewport = { themeColor: '#0F1114', colorScheme: 'dark' };

const RAIL_BOOT = `try{if(localStorage.getItem("chat-rail")==="1")document.documentElement.classList.add("rail")}catch(e){}`;

export default function V2RootLayout({ children }: { readonly children: ReactNode }) {
  return (
    <html data-theme="dark" lang="en" suppressHydrationWarning>
      <head>
        {/* Before first paint, as the prototype's boot.js does: restore the collapsed sidebar. */}
        <script dangerouslySetInnerHTML={{ __html: RAIL_BOOT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
