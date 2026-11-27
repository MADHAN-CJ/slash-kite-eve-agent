'use client';

import { useState } from 'react';
import type { RunSource } from '@/lib/v2/answer-model';
import { highlightPython } from './markdown';

/**
 * The Sources side panel (and the narrow-screen Sources pane): every request
 * the model made for the latest answer, as markets-hero app.js `dataPanels`
 * / `srcCard` draw them. Same markup, so chat.css applies unchanged.
 */

const IC: Record<string, string[]> = {
  price: ['M4 19l16 0', 'M4 15l4 -6l4 2l4 -5l4 4'],
  quote: ['M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0', 'M12 7v5l3 3'],
  alert: ['M10 5a2 2 0 1 1 4 0a7 7 0 0 1 4 6v3a4 4 0 0 0 2 3h-16a4 4 0 0 0 2 -3v-3a7 7 0 0 1 4 -6', 'M9 17v1a3 3 0 0 0 6 0v-1'],
  ind: [
    'M3 13a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v6a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z',
    'M15 9a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v10a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z',
    'M9 5a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v14a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z',
    'M4 20h14',
  ],
  scan: ['M10 10m-7 0a7 7 0 1 0 14 0a7 7 0 1 0 -14 0', 'M21 21l-6 -6'],
};

const iconFor = (s: RunSource): string[] => {
  const d = s.dataset;
  if (s.kind === 'watcher' || /alert|watcher/i.test(d)) return IC.alert;
  if (/indicator/i.test(d)) return IC.ind;
  if (s.kind === 'search' || /scan|search/i.test(d)) return IC.scan;
  if (/history|candle/i.test(d)) return IC.price;
  return IC.quote;
};

function Card({ s, open, label }: { readonly s: RunSource; readonly open: boolean; readonly label: string }) {
  const [copied, setCopied] = useState(false);
  const meta = [s.interval && `Interval ${s.interval}`, s.rows !== undefined && `${s.rows}${s.rows === 1 ? ' row' : ' rows'}`, s.range].filter(Boolean).join(' · ');
  const copy = async () => {
    if (!s.code) return;
    try {
      await navigator.clipboard.writeText(s.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      // clipboard refused
    }
  };
  return (
    <details className="dc" open={open}>
      <summary>
        <i className="di">
          <svg className="i" viewBox="0 0 24 24">
            {iconFor(s).map((d) => (
              <path d={d} key={d} />
            ))}
          </svg>
        </i>
        <span className="dt">
          <b>{s.dataset}</b>
          <small>{s.symbol}</small>
        </span>
        <svg className="i chev" viewBox="0 0 24 24">
          <path d="M6 9l6 6l6 -6" />
        </svg>
      </summary>
      <div className="db">
        <div className="dmeta">
          {meta ? <p className="dm">{meta}</p> : null}
          <div className="df">
            <span>
              As of <b>{s.asOf}</b>
            </span>
            {s.ms !== undefined ? <span>{s.ms} ms</span> : null}
            <span className={label === 'Real-time' ? 'ok' : 'ok dly'}>{label}</span>
          </div>
        </div>
        {s.values.length ? (
          <div className="kvs">
            {s.values.map(([k, v]) => (
              <div className="kv" key={`${k}:${v}`}>
                <span>{k}</span>
                <b>{v}</b>
              </div>
            ))}
          </div>
        ) : null}
        {s.code ? (
          <div className="py">
            <div className="ph">
              <span>Python your AI ran</span>
              <button aria-label="Copy code" onClick={() => void copy()} type="button">
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <pre>
              {/* biome-ignore lint/security/noDangerouslySetInnerHtml: escaped by highlightPython */}
              <code dangerouslySetInnerHTML={{ __html: highlightPython(s.code) }} />
            </pre>
          </div>
        ) : null}
      </div>
    </details>
  );
}

export function SourcesList({ sources, loading, label = 'Real-time' }: { readonly sources: RunSource[]; readonly loading: boolean; readonly label?: string }) {
  if (loading) {
    return (
      <>
        <div className="dsum">
          <b>Fetching data…</b>
          <span>Your AI is asking /markets for the numbers</span>
        </div>
        <div className="dc sk2">
          <i />
          <i />
          <i />
        </div>
      </>
    );
  }
  if (!sources.length) return null;
  const asOf = sources[sources.length - 1].asOf;
  return (
    <>
      <div className="dsum">
        <b>
          {sources.length}
          {sources.length === 1 ? ' request' : ' requests'}
        </b>
        <span>
          As of {asOf} · {label}
        </span>
      </div>
      {sources.map((s, i) => (
        <Card key={s.callId} label={label} open={i === 0} s={s} />
      ))}
    </>
  );
}

/** The narrow-screen pane: the same list in a card, or a note when there is nothing yet. */
export function SourcesPane(props: { readonly sources: RunSource[]; readonly loading: boolean; readonly label?: string }) {
  if (!props.loading && !props.sources.length) return <div className="empty-tab">The sources behind your answers will show here.</div>;
  return (
    <div className="rcard2">
      <SourcesList {...props} />
    </div>
  );
}
