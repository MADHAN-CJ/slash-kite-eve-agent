'use client';

import { useEffect, useRef, useState } from 'react';
import { bigNumber, fmtNum, gapText, LIVE, STATUS_LABEL, type W8 } from '@/lib/v2/watcher-view';

/**
 * The Watchers screen, E · Simple (markets-hero ux/flows/watchers/flow.js):
 * the list (Active · Finished) and one watcher — its state, today's value as
 * the one big number, a banner when something needs saying, the script
 * behind an icon, and what reached the inbox. Same DOM and class names as
 * the prototype, so `styles/v2/watchers.css` applies unchanged. Controlled:
 * the caller owns the data and does the pause / resume / cancel calls.
 */

const KITE = (
  <svg aria-hidden="true" className="kt" viewBox="0 0 22 16">
    <path d="M0 8L11 0h11L11 8l11 8H11z" fill="#E8533F" />
    <path d="M11 8l11-8v16z" fill="#C93A26" opacity=".55" />
  </svg>
);
const PATHS: Record<string, React.ReactNode> = {
  chat: <path d="M4 5h16v11H9l-5 4z" />,
  pause: <path d="M9 6v12M15 6v12" />,
  play: <path d="M8 5l11 7-11 7z" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  code: <path d="M8 8l-4 4 4 4M16 8l4 4-4 4" />,
  mail: (
    <>
      <rect height="14" rx="2" width="18" x="3" y="5" />
      <path d="M3 7l9 6 9-6" />
    </>
  ),
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  bell: (
    <>
      <path d="M10 5a2 2 0 1 1 4 0a7 7 0 0 1 4 6v3a4 4 0 0 0 2 3h-16a4 4 0 0 0 2-3v-3a7 7 0 0 1 4-6" />
      <path d="M9 17v1a3 3 0 0 0 6 0v-1" />
    </>
  ),
  redo: <path d="M4 12a8 8 0 0 1 14-5l2 2M20 4v5h-5" />,
};
const ic = (k: string) => (
  <svg aria-hidden="true" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
    {PATHS[k]}
  </svg>
);
const Dot = ({ st }: { readonly st: string }) => <i className={`d8 ${st}`} />;

const CANCEL_ASK_MS = 2600;
export const EXAMPLE_PROMPTS = [
  'Tell me when GOLDBEES drops below 100',
  'Tell me when RELIANCE closes below 2,912 on the 15-min chart',
  'Tell me when NIFTY FUT RSI on 15 min goes above 70',
] as const;

export interface WatchersActions {
  readonly onPause: (w: W8) => Promise<void> | void;
  readonly onResume: (w: W8) => Promise<void> | void;
  readonly onCancel: (w: W8) => Promise<void> | void;
  readonly onOpenChat: (w: W8) => void;
  readonly onTrade: (w: W8) => void;
  readonly onReconnect: () => void;
  readonly onFix: (w: W8) => void;
  readonly onWatchAgain: (w: W8) => void;
  readonly onAskExample: (prompt: string) => void;
}

function CancelButton({ onConfirm }: { readonly onConfirm: () => void }) {
  // Cancel asks once: "Cancel for good?" for 2.6 s, then the second tap cancels.
  const [ask, setAsk] = useState(false);
  const t = useRef(0);
  useEffect(() => () => window.clearTimeout(t.current), []);
  return (
    <button
      aria-label="Cancel"
      className={ask ? 'ib8 is-ask' : 'ib8'}
      data-a="cancel"
      onClick={() => {
        if (ask) {
          window.clearTimeout(t.current);
          setAsk(false);
          onConfirm();
          return;
        }
        setAsk(true);
        t.current = window.setTimeout(() => setAsk(false), CANCEL_ASK_MS);
      }}
      title="Cancel"
      type="button"
    >
      {ask ? 'Cancel for good?' : ic('x')}
    </button>
  );
}

function Banner({ w, act }: { readonly w: W8; readonly act: WatchersActions }) {
  if (w.started) {
    return (
      <div className="bn8 ok">
        <span>
          <b>Started just now</b>
          {w.chat ? `, from “${w.chat}”` : ''}. It checks every {w.every} in market hours. The first check sets the baseline and never emails.
        </span>
      </div>
    );
  }
  if (w.st === 'paused' && w.kitePaused) {
    return (
      <div className="bn8">
        <span>Paused. Your Kite session ended at 6:00 AM.</span>
        <button className="pr8" data-a="kite" onClick={act.onReconnect} type="button">
          Reconnect Kite
        </button>
      </div>
    );
  }
  if (w.st === 'error') {
    return (
      <div className="bn8 er">
        <span>{w.error}</span>
        <button className="pr8" data-a="fix" onClick={() => act.onFix(w)} type="button">
          Fix it in chat
        </button>
      </div>
    );
  }
  if (w.st === 'paused') {
    return (
      <div className="bn8">
        <span>Paused by you. It won’t check or email until you resume.</span>
      </div>
    );
  }
  if (w.st === 'met') {
    const back = w.level !== null && w.direction ? `after it goes back ${w.direction === 'below' ? 'above' : 'below'} ${fmtNum(w.level, 2)} and crosses again` : 'after it turns false and then true again';
    return (
      <div className="bn8">
        <span>
          True{w.metSince ? ` since ${w.metSince}` : ' now'}. It emails again only {back}.
        </span>
      </div>
    );
  }
  return null;
}

function NumberLine({ w }: { readonly w: W8 }) {
  const gap = gapText(w);
  let line: string;
  if (!LIVE(w)) line = `last value · ${STATUS_LABEL[w.st].toLowerCase()} ${w.ended}`;
  else if (w.now === null) line = `no value since ${w.lastChecked}`;
  else if (w.started) line = [gap, w.firstCheck ? `first check at ${w.firstCheck}` : null, `ends ${w.ends}`].filter(Boolean).join(' · ');
  else if (w.st === 'paused') line = `last checked ${w.lastChecked} · ends ${w.ends}`;
  else line = [gap, `checks every ${w.every}`, `ends ${w.ends}`].filter(Boolean).join(' · ');
  return (
    <div className="n8">
      <b>{bigNumber(w)}</b>
      <span>{line}</span>
    </div>
  );
}

export function WatchersScreen({
  watchers,
  email,
  loading,
  initialSelected,
  initialTab,
  headerNote,
  actions,
}: {
  readonly watchers: readonly W8[];
  readonly email: string;
  readonly loading?: boolean;
  readonly initialSelected?: string;
  readonly initialTab?: 'active' | 'done';
  /** Extra text after the email in the header (the Kite-ended morning shows the time). */
  readonly headerNote?: string;
  readonly actions: WatchersActions;
}) {
  const [tab, setTab] = useState<'active' | 'done'>(initialTab ?? 'active');
  const [sel, setSel] = useState<string | null>(initialSelected ?? null);
  const [code, setCode] = useState(false);
  const live = watchers.filter(LIVE);
  const done = watchers.filter((w) => !LIVE(w));
  const list = tab === 'done' ? done : live;
  const w = list.find((x) => x.id === sel) ?? list[0];

  const header = (
    <div className="h8">
      <h2>Watchers</h2>
      <span>
        {live.length ? `${live.length} active · ` : ''}alerts go to {email}
        {headerNote ? ` · ${headerNote}` : ''}
      </span>
    </div>
  );

  if (loading) return <div className="w6">{header}</div>;
  if (!watchers.length) {
    return (
      <div className="w6" id="w6">
        {header}
        <div className="em9">
          <i>{ic('bell')}</i>
          <h3>No watchers yet</h3>
          <p>A watcher is a question that keeps running after the chat closes. It emails you when it’s true. Ask for one in a chat, or tap Watch this under any answer.</p>
          <div className="ps9">
            {EXAMPLE_PROMPTS.map((q) => (
              <button data-q={q} key={q} onClick={() => actions.onAskExample(q)} type="button">
                {q}
                {ic('arrow')}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const listCol = (
    <div className="lc8">
      <div className="sg8">
        <button
          className={tab === 'active' ? 'is-on' : undefined}
          data-tab="active"
          onClick={() => {
            setTab('active');
            setSel(null);
            setCode(false);
          }}
          type="button"
        >
          Active<small>{live.length}</small>
        </button>
        <button
          className={tab === 'done' ? 'is-on' : undefined}
          data-tab="done"
          onClick={() => {
            setTab('done');
            setSel(null);
            setCode(false);
          }}
          type="button"
        >
          Finished<small>{done.length}</small>
        </button>
      </div>
      <div className="ls8">
        {list.map((x) => (
          <button
            className={x.id === w?.id ? 'is-on' : undefined}
            data-pick={x.id}
            key={x.id}
            onClick={() => {
              setSel(x.id);
              setCode(false);
            }}
            type="button"
          >
            <Dot st={x.st} />
            <b>{x.sym}</b>
            {x.alerts.length ? (
              <em>
                {ic('mail')}
                {x.alerts.length}
              </em>
            ) : (
              <em />
            )}
            <small>{x.rule}</small>
          </button>
        ))}
      </div>
    </div>
  );

  if (!w) {
    return (
      <div className="w6" id="w6">
        {header}
        <div className="g8">
          {listCol}
          <div className="no8">Nothing here yet.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="w6" id="w6">
      {header}
      <div className="g8">
        {listCol}
        <div className="pn8" data-id={w.id}>
          <div className="t8">
            <span className="s8">
              <Dot st={w.st} />
              {STATUS_LABEL[w.st]}
            </span>
            <span className="ex6">
              {w.sym} · {w.ex}
            </span>
            <span className="fl8" />
            {LIVE(w) ? (
              <button className="ob8" data-a="inchat" onClick={() => actions.onOpenChat(w)} type="button">
                {ic('chat')}Open in chat
              </button>
            ) : (
              <button className="ob8" data-a="again" onClick={() => actions.onWatchAgain(w)} type="button">
                {ic('redo')}Watch again
              </button>
            )}
            <button aria-label="Trade on Kite" className="ib8" data-a="trade" onClick={() => actions.onTrade(w)} title="Trade on Kite" type="button">
              {KITE}
            </button>
            {w.st === 'paused' && !w.kitePaused ? (
              <button aria-label="Resume" className="ib8" data-a="resume" onClick={() => void actions.onResume(w)} title="Resume" type="button">
                {ic('play')}
              </button>
            ) : null}
            {w.st === 'watching' || w.st === 'met' ? (
              <button aria-label="Pause" className="ib8" data-a="pause" onClick={() => void actions.onPause(w)} title="Pause" type="button">
                {ic('pause')}
              </button>
            ) : null}
            {LIVE(w) ? <CancelButton key={w.id} onConfirm={() => void actions.onCancel(w)} /> : null}
            {w.script ? (
              <button
                aria-label="See the script"
                aria-pressed={code}
                className={code ? 'ib8 is-on' : 'ib8'}
                data-a="script"
                onClick={() => setCode((c) => !c)}
                title="See the script"
                type="button"
              >
                {ic('code')}
              </button>
            ) : null}
          </div>
          <h3>{w.rule}</h3>
          <NumberLine w={w} />
          <Banner act={actions} w={w} />
          {code ? (
            <pre
              className="sc6 cd8"
              // biome-ignore lint/security/noDangerouslySetInnerHtml: escaped before the comment highlight
              dangerouslySetInnerHTML={{
                __html: w.script.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string).replace(/(#[^\n]*)/g, '<span class="cm">$1</span>'),
              }}
            />
          ) : null}
          <div className="sc8">
            Sent to your inbox<em>{w.alerts.length || ''}</em>
          </div>
          {w.alerts.length ? (
            <div className="lg8">
              {w.alerts.map((a) => (
                // The whole row opens the chat (spec: "tapping the row opens the chat"); hover shows Trade too.
                <div
                  className={a.isToday ? 'r8 is-new' : 'r8'}
                  data-a="inchat"
                  data-id={w.id}
                  key={a.at}
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest('.rx8 button')) return;
                    actions.onOpenChat(w);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') actions.onOpenChat(w);
                  }}
                  role="button"
                  tabIndex={0}
                  title="Open in chat"
                >
                  <time>{a.when}</time>
                  <span className="m8">
                    {a.what}
                    {a.value !== null ? (
                      <>
                        {' '}
                        at <b>{a.value}</b>
                      </>
                    ) : null}
                  </span>
                  <span className="em8" title={a.emailed ? `Emailed to ${email}` : 'Not emailed'}>
                    {ic('mail')}
                  </span>
                  <span className="rx8">
                    <button data-a="trade" onClick={() => actions.onTrade(w)} type="button">
                      {KITE}Trade
                    </button>
                    <button data-a="inchat" onClick={() => actions.onOpenChat(w)} type="button">
                      Open in chat{ic('arrow')}
                    </button>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="no8">{LIVE(w) ? `Nothing sent yet. When it fires, you get an email at ${email} and it shows here.` : 'Nothing was sent.'}</div>
          )}
        </div>
      </div>
    </div>
  );
}
