'use client';

import { ExternalLinkIcon } from 'lucide-react';
import { hostOf, type SourceCard } from '@/lib/client/tool-output';

/** Citation cards under a web_search tool call (live and history). */
export function SourceCards({ sources }: { readonly sources: SourceCard[] }) {
  return (
    <ul aria-label="Sources" className="grid gap-2 sm:grid-cols-2" data-testid="source-cards">
      {sources.map((s) => (
        <li key={s.url}>
          <a
            className="flex h-full flex-col gap-1 rounded-md border bg-card px-3 py-2 text-sm transition-colors hover:border-ring/40 hover:bg-accent"
            href={s.url}
            rel="noreferrer"
            target="_blank"
          >
            <span className="flex items-center gap-1.5 text-muted-foreground text-xs">
              <span className="truncate">{hostOf(s.url)}</span>
              {s.published ? <span className="shrink-0">· {formatDate(s.published)}</span> : null}
              <ExternalLinkIcon className="ml-auto size-3 shrink-0" />
            </span>
            <span className="line-clamp-2 font-medium leading-snug">{s.title}</span>
            {s.snippet ? <span className="line-clamp-2 text-muted-foreground text-xs">{s.snippet}</span> : null}
          </a>
        </li>
      ))}
    </ul>
  );
}

function formatDate(value: string): string {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return value;
  return new Date(ms).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}
