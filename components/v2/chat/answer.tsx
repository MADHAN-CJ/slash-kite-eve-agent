'use client';

import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { type AnswerModel, type RunSource, type RunStep, statusLine } from '@/lib/v2/answer-model';
import { ChartPane } from './chart-pane';
import { Icon } from './icons';
import { escapeHtml, highlightPython, renderMarkdown } from './markdown';

/**
 * One answer, as the prototype draws it (markets-hero app.js `bubble` +
 * run.js `f5Tools` / `f5After` / `f5Stopped`): status line, the plan, the
 * Answer · Chart · Code tabs, the text with numbered source marks, the
 * Sources card holding the receipt, next actions, and a footer for a run
 * that stopped, timed out, lost Kite or found no data. Same DOM and class
 * names, so `styles/v2/chat.css` + `run.css` apply unchanged.
 */

const HIGHLIGHT_MS = 1400;
const COPIED_MS = 1200;

const Chevron = () => (
  <svg className="cv5" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" viewBox="0 0 24 24">
    <path d="M6 9l6 6 6-6" />
  </svg>
);

const KiteMark = () => (
  <svg aria-hidden="true" className="i" style={{ stroke: 'none' }} viewBox="0 0 22 16">
    <path d="M0 8L11 0h11L11 8l11 8H11z" fill="#E8533F" />
    <path d="M11 8l11-8v16z" fill="#C93A26" opacity=".55" />
  </svg>
);

const rcIcon = (d: string) => (
  <svg aria-hidden="true" className="i" viewBox="0 0 24 24">
    <path d={d} />
  </svg>
);

export type AnswerFooter =
  | { kind: 'stopped' }
  | { kind: 'timeout' }
  | { kind: 'kite-expired' }
  | { kind: 'no-data' }
  | { kind: 'error'; message?: string };

export function footerFor(m: AnswerModel): AnswerFooter | null {
  if (m.status === 'stopped') return m.kiteExpired ? { kind: 'kite-expired' } : { kind: 'stopped' };
  if (m.status === 'error') {
    if (m.kiteExpired) return { kind: 'kite-expired' };
    if (/timed? ?out|timeout/i.test(m.error ?? '')) return { kind: 'timeout' };
    return { kind: 'error', message: m.error };
  }
  if (m.status === 'done' && m.kiteExpired) return { kind: 'kite-expired' };
  if (m.status === 'done' && m.noData) return { kind: 'no-data' };
  return null;
}

function Plan({ steps, live }: { readonly steps: RunStep[]; readonly live: boolean }) {
  const [open, setOpen] = useState(false);
  if (steps.length === 0) return <div className="t5" />;
  const ms = steps.reduce((a, s) => a + (s.ms ?? 0), 0);
  const cls = ['th6', live ? 'is-live' : '', open ? 'is-open' : ''].filter(Boolean).join(' ');
  return (
    <div className="t5">
      <div className={cls}>
        {live ? null : (
          <button aria-expanded={open} className="th6c" onClick={() => setOpen((o) => !o)} type="button">
            Plan · {steps.length} {steps.length === 1 ? 'step' : 'steps'}
            {ms ? ` · ${ms} ms` : ''}
            <Chevron />
          </button>
        )}
        <div className="th6body">
          <div className="pl6">
            <ol>
              {steps.map((s) => (
                <li className={s.status === 'running' ? 'is-run' : s.status === 'ok' ? 'is-ok' : s.status === 'stopped' || s.status === 'error' ? 'is-stop' : undefined} key={s.callId}>
                  <i />
                  <span>{s.label}</span>
                  {s.status === 'ok' ? (
                    <small>
                      {s.detail}
                      {s.ms ? ` · ${s.ms} ms` : ''}
                    </small>
                  ) : s.status === 'stopped' ? (
                    <small>stopped</small>
                  ) : s.status === 'error' ? (
                    <small>failed</small>
                  ) : null}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}

function Receipt({ m, onCode }: { readonly m: AnswerModel; readonly onCode: () => void }) {
  const reported = m.sources.some((s) => s.rows !== undefined);
  return (
    <div className="rc">
      {reported ? (
        <span>
          {rcIcon('M4 6h16M4 12h16M4 18h16')}
          <span>
            Read <b>{m.rows.toLocaleString('en-IN')}{m.rows === 1 ? ' row' : ' rows'}</b>
          </span>
        </span>
      ) : null}
      <span className="to">
        {rcIcon('M5 12h14M13 6l6 6-6 6')}
        <span>
          <b>~{m.tokensSent} tokens</b> sent to your AI
        </span>
      </span>
      {m.asOf ? (
        <span>
          <svg aria-hidden="true" className="i" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="8" />
            <path d="M12 8v4l3 2" />
          </svg>
          <span>
            As of <b>{m.asOf}</b>
          </span>
        </span>
      ) : null}
      <button data-f5="tabcode" onClick={onCode} type="button">
        {rcIcon('M9 7l-5 5 5 5M15 7l5 5-5 5')}Code
      </button>
    </div>
  );
}

function SourceRow({ s, latest, open, highlighted, onToggle }: { readonly s: RunSource; readonly latest: string; readonly open: boolean; readonly highlighted: boolean; readonly onToggle: (open: boolean) => void }) {
  const chips = [s.interval, s.rows !== undefined ? `${s.rows} ${s.rows === 1 ? 'row' : 'rows'}` : '', s.range, s.ms !== undefined ? `${s.ms} ms` : ''].filter(Boolean) as string[];
  const time = s.asOf && s.asOf !== latest ? `As of ${s.asOf}` : '';
  return (
    <li className="sf5-item">
      <details className={highlighted ? 'sf5-source is-hi' : 'sf5-source'} data-n={s.n} onToggle={(e) => onToggle((e.currentTarget as HTMLDetailsElement).open)} open={open}>
        <summary>
          <span className="sf5-number">{s.n}</span>
          <span className="sf5-name">
            <b>{s.dataset}</b>
            {s.symbol ? <span>{s.symbol}</span> : null}
          </span>
          <Chevron />
        </summary>
        <div className="sf5-content">
          {chips.length ? (
            <div className="sf5-chips">
              {chips.map((c) => (
                <span key={c}>{c}</span>
              ))}
            </div>
          ) : null}
          {time ? <p className="sf5-time">{time}</p> : null}
          {s.error ? <p className="sf5-time">{s.error.split('\n').slice(-1)[0]}</p> : null}
          {s.values.length ? (
            <dl className="sf5-values">
              {s.values.map(([k, v]) => (
                <div className="sf5-value" key={`${k}:${v}`}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          {s.code ? (
            <details className="sf5-code">
              <summary>
                <span className="sf5-code-show">Show code</span>
                <span className="sf5-code-hide">Hide code</span>
                <Chevron />
              </summary>
              <pre>
                <code>{s.code}</code>
              </pre>
            </details>
          ) : null}
        </div>
      </details>
    </li>
  );
}

export function AnswerMessage({
  model,
  index,
  dataLabel = 'Through Kite',
  onRetry,
  onFollowup,
  onWatch,
  onTrade,
  onEditQuestion,
  onReconnect,
}: {
  readonly model: AnswerModel;
  readonly index: number;
  readonly dataLabel?: string;
  readonly onRetry?: () => void;
  readonly onFollowup?: (text: string) => void;
  readonly onWatch?: (symbol: string) => void;
  readonly onTrade?: (symbol: string) => void;
  readonly onEditQuestion?: () => void;
  readonly onReconnect?: () => void;
}) {
  const m = model;
  const live = m.status === 'planning' || m.status === 'running' || m.status === 'writing';
  // A plan cut short stays open with its dashed steps (run.js f5Stopped never folds it).
  const planLive = live || (m.status === 'stopped' && m.steps.some((s) => s.status === 'stopped'));
  const finished = m.status === 'done';
  // Tabs, marks and the Sources card belong to a finished answer (the prototype only adds them then).
  const hasSources = m.sources.length > 0 && finished;
  const [tab, setTab] = useState<'answer' | 'chart' | 'code'>('answer');
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [openRows, setOpenRows] = useState<Set<number>>(() => new Set([1]));
  const [hi, setHi] = useState<number | null>(null);
  const [copied, setCopied] = useState<'msg' | 'code' | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const hiTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(hiTimer.current), []);

  const footer = footerFor(m);
  const codeOf = m.sources.filter((s) => s.code);
  const hasCode = codeOf.length > 0;
  const firstSymbol = m.sources[0]?.symbol ?? '';

  const openSource = (n: number) => {
    setSourcesOpen(true);
    setOpenRows((prev) => new Set(prev).add(n));
    setHi(n);
    window.clearTimeout(hiTimer.current);
    hiTimer.current = window.setTimeout(() => setHi(null), HIGHLIGHT_MS);
    requestAnimationFrame(() => {
      const row = root.current?.querySelector<HTMLElement>(`.sf5-source[data-n="${n}"] > summary`);
      row?.focus({ preventScroll: true });
      row?.scrollIntoView({ block: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    });
  };

  // Clicks inside the rendered markdown: follow-up chips and source marks.
  const onBody = (e: MouseEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement;
    const fu = t.closest('.fu button');
    if (fu) {
      onFollowup?.(fu.textContent ?? '');
      return;
    }
    const mark = t.closest<HTMLElement>('.m5');
    if (mark) openSource(Number(mark.dataset.n));
  };

  const copy = async (what: 'msg' | 'code') => {
    const text = what === 'msg' ? m.text : codeOf.map((s) => s.code).join('\n\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      window.setTimeout(() => setCopied(null), COPIED_MS);
    } catch {
      // clipboard refused
    }
  };

  // The marks sit at the end of the first paragraph, as in the prototype.
  let html = renderMarkdown(m.text);
  if (hasSources) {
    const marks = m.sources.map((s) => `<button type="button" class="m5" data-n="${s.n}" aria-label="Open source ${s.n}, ${escapeHtml(s.dataset)}">${s.n}</button>`).join('');
    const i = html.indexOf('</p>');
    html = i >= 0 ? `${html.slice(0, i)}${marks}${html.slice(i)}` : `${html}<p>${marks}</p>`;
  }

  const latest = m.sources[m.sources.length - 1]?.asOf ?? '';
  const cls = ['msg', 'a', live ? 'streaming' : ''].filter(Boolean).join(' ');

  return (
    <div className={cls} data-i={index} data-t5={tab} ref={root}>
      <div className="st">
        {live ? <i /> : null}
        {statusLine(m)}
      </div>
      <Plan live={planLive} steps={m.steps} />
      {hasSources ? (
        <div className="tb5" role="tablist">
          <button className={tab === 'answer' ? 'is-on' : undefined} data-t5="answer" onClick={() => setTab('answer')} type="button">
            Answer
          </button>
          {m.chart ? (
            <button className={tab === 'chart' ? 'is-on' : undefined} data-t5="chart" onClick={() => setTab('chart')} type="button">
              Chart
            </button>
          ) : null}
          {hasCode ? (
            <button className={tab === 'code' ? 'is-on' : undefined} data-t5="code" onClick={() => setTab('code')} type="button">
              Code
            </button>
          ) : null}
        </div>
      ) : null}
      {footer?.kind === 'error' ? (
        <div className="md">
          <div className="err">
            Couldn’t get an answer.{' '}
            <button className="ib" data-a="retry" onClick={onRetry} style={{ padding: '0 12px' }} type="button">
              Try again
            </button>
          </div>
        </div>
      ) : m.text || live ? (
        // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitised by DOMPurify in renderMarkdown
        <div className="md" dangerouslySetInnerHTML={{ __html: html }} onClick={onBody} />
      ) : null}
      {hasSources && m.chart ? (
        <div className="pn5 ch5">
          <ChartPane spec={m.chart} />
          <p>Drawn from the candles the script read.</p>
        </div>
      ) : null}
      {hasSources && hasCode ? (
        <div className="pn5 co5">
          <pre
            // biome-ignore lint/security/noDangerouslySetInnerHtml: escaped by highlightPython
            dangerouslySetInnerHTML={{
              __html: codeOf.map((s) => `<span class="c5"># [${s.n}] ${escapeHtml(s.dataset)} · ${s.ms ?? 0} ms</span>\n${highlightPython(s.code ?? '')}`).join('\n\n'),
            }}
          />
          <div className="cb5">
            <p>Ran on /markets, next to the data{m.ms ? ` · ${m.ms} ms` : ''}</p>
            <button data-f5="copycode" onClick={() => void copy('code')} type="button">
              {copied === 'code' ? 'Copied' : 'Copy code'}
            </button>
          </div>
        </div>
      ) : null}
      {hasSources ? (
        <details className="sf5" onToggle={(e) => setSourcesOpen((e.currentTarget as HTMLDetailsElement).open)} open={sourcesOpen}>
          <summary>
            <b>Sources</b>
            <span className="sf5-count">{m.sources.length}</span>
            <span className={dataLabel === 'Through Kite' ? 'sf5-status' : 'sf5-status is-delayed'}>{dataLabel}</span>
            <Chevron />
          </summary>
          <div className="sf5-body">
            <Receipt m={m} onCode={() => setTab('code')} />
            <ol className="sf5-list" role="list">
              {m.sources.map((s) => (
                <SourceRow
                  highlighted={hi === s.n}
                  key={s.callId}
                  latest={latest}
                  onToggle={(open) =>
                    setOpenRows((prev) => {
                      const next = new Set(prev);
                      if (open) next.add(s.n);
                      else next.delete(s.n);
                      return next;
                    })
                  }
                  open={openRows.has(s.n)}
                  s={s}
                />
              ))}
            </ol>
          </div>
        </details>
      ) : null}
      {finished && !m.noData ? (
        <div className="act" data-sym={firstSymbol}>
          {hasSources ? (
            <>
              <button className="a5" data-f5="watch" onClick={() => onWatch?.(firstSymbol)} type="button">
                <Icon name="bell" />
                <span>Watch this</span>
              </button>
              <button className="a5" data-f5="trade" onClick={() => onTrade?.(firstSymbol)} type="button">
                <KiteMark />
                <span>Trade on Kite</span>
              </button>
            </>
          ) : null}
          <button aria-label="Copy" className="ib" data-a="copy" onClick={() => void copy('msg')} type="button">
            {copied === 'msg' ? '✓' : <CopyIcon />}
          </button>
          <button aria-label="Try again" className="ib" data-a="redo" onClick={onRetry} type="button">
            <RedoIcon />
          </button>
        </div>
      ) : null}
      {footer && footer.kind !== 'error' ? (
        <div className="so5">
          {footer.kind === 'stopped' ? (
            <>
              <span>{m.text ? 'Stopped. Nothing more was run.' : 'Stopped before the answer. Nothing more was run.'}</span>
              <button data-a="retry" onClick={onRetry} type="button">
                Ask again
              </button>
            </>
          ) : footer.kind === 'timeout' ? (
            <>
              <span>This answer took too long. Try the same question again.</span>
              <button data-a="retry" onClick={onRetry} type="button">
                Try again
              </button>
            </>
          ) : footer.kind === 'kite-expired' ? (
            <>
              <span>Your question is still here. Reconnect Kite to try again.</span>
              {onReconnect ? (
                <button onClick={onReconnect} type="button">
                  Reconnect Kite
                </button>
              ) : null}
            </>
          ) : (
            <button onClick={onEditQuestion} type="button">
              Edit question
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}

const CopyIcon = () => (
  <svg className="i" viewBox="0 0 24 24">
    <path d="M7 7m0 2.667a2.667 2.667 0 0 1 2.667 -2.667h8.666a2.667 2.667 0 0 1 2.667 2.667v8.666a2.667 2.667 0 0 1 -2.667 2.667h-8.666a2.667 2.667 0 0 1 -2.667 -2.667z" />
    <path d="M4.012 16.737a2.005 2.005 0 0 1 -1.012 -1.737v-10c0 -1.1 .9 -2 2 -2h10c.75 0 1.158 .385 1.5 1" />
  </svg>
);

const RedoIcon = () => (
  <svg className="i" viewBox="0 0 24 24">
    <path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4" />
    <path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4" />
  </svg>
);

export function UserMessage({ text, index }: { readonly text: string; readonly index: number }) {
  return (
    <div className="msg u" data-i={index}>
      <div className="b">{text}</div>
    </div>
  );
}
