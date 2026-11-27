import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Word } from '@/components/v2/chat/brand';
import { legal } from '@/lib/legal';

/** The legal pages (terms, privacy, support) in the v2 face — plan-v2 V12. */

export interface LegalSection {
  id: string;
  title: string;
  body: ReactNode;
}

export function legalMetadata(title: string, description: string): Metadata {
  return { title: `${title} · ${legal.productName}`, description, robots: { index: true } };
}

/** "/markets" inside prose. */
export function MarketsLabel() {
  return (
    <span className="mkl">
      <i>/</i>markets
    </span>
  );
}

const PAGES = [
  ['/terms', 'Terms'],
  ['/privacy', 'Privacy'],
  ['/support', 'Support'],
] as const;

export function LegalPage({
  path,
  title,
  intro,
  sections,
}: {
  readonly path: (typeof PAGES)[number][0];
  readonly title: string;
  readonly intro: ReactNode;
  readonly sections: readonly LegalSection[];
}) {
  return (
    <main className="lg2">
      <header className="lg2-top">
        <Link aria-label={`${legal.productName} home`} className="lg2-home" href="/">
          <Word />
        </Link>
        <nav aria-label="Legal pages">
          {PAGES.map(([href, label]) => (
            <Link aria-current={href === path ? 'page' : undefined} href={href} key={href}>
              {label}
            </Link>
          ))}
        </nav>
      </header>

      <article className="legal">
        <h1>{title}</h1>
        <p className="legal-meta">
          Effective {legal.effectiveDate} · Last updated {legal.lastUpdated}
        </p>
        <div className="legal-intro">{intro}</div>
        <nav aria-label="Contents" className="legal-toc">
          <ol>
            {sections.map((s, i) => (
              <li key={s.id}>
                <a href={`#${s.id}`}>
                  {i + 1}. {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>
        {sections.map((s, i) => (
          <section aria-labelledby={`${s.id}-title`} id={s.id} key={s.id}>
            <h2 id={`${s.id}-title`}>
              {i + 1}. {s.title}
            </h2>
            {s.body}
          </section>
        ))}
      </article>

      <footer className="lg2-foot">
        <p>
          <MarketsLabel /> never places orders for you. You trade on Zerodha’s Kite.
        </p>
        <nav aria-label="Legal">
          {PAGES.map(([href, label]) => (
            <Link href={href} key={href}>
              {label}
            </Link>
          ))}
          <a href={legal.marketingUrl}>slash.markets</a>
        </nav>
      </footer>
    </main>
  );
}
