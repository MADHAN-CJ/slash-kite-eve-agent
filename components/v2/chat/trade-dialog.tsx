'use client';

import Script from 'next/script';
import { useEffect, useRef, useState } from 'react';
import { fetchTradeMarket } from '@/lib/client/trade-market';
import { publisherAction, type PublisherWindow } from '@/lib/client/publisher-action';
import {
  badPrice,
  badQuantity,
  initialTicket,
  money,
  orderValue,
  ticketEntry,
  ticketSummary,
  watcherSide,
  type TicketForm,
  type TradeContext,
  type TradeMarket,
} from '@/lib/v2/trade';
import { SessionExpiredError } from '@/lib/client/broker';
import { tradeFormFor, tradePath } from '@/lib/client/kite-publisher';

export type TradeView = 'form' | 'window' | 'closed' | 'blocked';

const ICON = {
  close: 'M6 6l12 12M18 6L6 18',
  bell: 'M10 5a2 2 0 1 1 4 0a7 7 0 0 1 4 6v3a4 4 0 0 0 2 3H4a4 4 0 0 0 2-3v-3a7 7 0 0 1 4-6M9 17v1a3 3 0 0 0 6 0v-1',
  chat: 'M4 5h16v11H9l-5 4z',
  mail: 'M3 7l9 6 9-6M3 5h18v14H3z',
  check: 'M5 12l5 5 9-10',
  warn: 'M12 4l9 16H3zM12 10v4M12 17v.5',
  lock: 'M5 11h14v9H5zM8 11V8a4 4 0 0 1 8 0v3',
};
function Icon({ name }: { readonly name: keyof typeof ICON }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      <path d={ICON[name]} />
    </svg>
  );
}
function KiteWhite() {
  return (
    <svg aria-hidden="true" viewBox="0 0 22 16">
      <path d="M0 8L11 0h11L11 8l11 8H11z" fill="#fff" />
      <path d="M11 8l11-8v16z" fill="#fff" opacity=".55" />
    </svg>
  );
}

function quoteTime(iso: string | null): string {
  if (!iso) return 'last price';
  if (/^\d\d:\d\d$/.test(iso)) return `last · ${iso}`;
  const time = new Date(iso.includes(' ') && !/[+Z]/.test(iso) ? `${iso.replace(' ', 'T')}+05:30` : iso);
  return Number.isNaN(time.getTime())
    ? 'last price'
    : `last · ${time.toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })}`;
}

/** Prototype DOM and CSS, on real instrument metadata. Only the lab supplies
 * fixtures and the plain-grey stand-in; production always invokes Publisher. */
export function TradeDialog({
  context,
  apiKey,
  onClose,
  onReconnect,
  onSessionLost,
  fixture,
  initialView = 'form',
  invalid = false,
}: {
  readonly context: TradeContext;
  readonly apiKey: string | null;
  readonly onClose: () => void;
  readonly onReconnect?: () => void;
  readonly onSessionLost?: (error: unknown) => void;
  readonly fixture?: TradeMarket;
  readonly initialView?: TradeView;
  readonly invalid?: boolean;
}) {
  const [market, setMarket] = useState<TradeMarket | null>(fixture ?? null);
  const [selected, setSelected] = useState(fixture?.selectedKey ?? '');
  const instrument = market?.instruments.find((x) => x.key === selected) ?? null;
  const [form, setForm] = useState<TicketForm>(() => {
    const f = initialTicket(context, fixture?.instruments.find((x) => x.key === fixture.selectedKey) ?? null);
    return invalid ? { ...f, quantity: '0', price: '0', orderType: 'LIMIT' } : f;
  });
  const [view, setView] = useState<TradeView>(initialView);
  const [ready, setReady] = useState(Boolean(fixture));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!fixture);
  const [attempt, setAttempt] = useState(0);
  const host = useRef<HTMLDivElement>(null);
  const publisher = useRef<PublisherWindow | null>(null);
  const callbacks = useRef({ onClose, onSessionLost });
  callbacks.current = { onClose, onSessionLost };

  useEffect(() => {
    if (fixture) return;
    const ctl = new AbortController();
    setLoading(true);
    setError(null);
    void fetchTradeMarket(context, ctl.signal)
      .then((m) => {
        if (ctl.signal.aborted) return;
        setMarket(m);
        setSelected(m.selectedKey ?? '');
        setForm(initialTicket(context, m.instruments.find((x) => x.key === m.selectedKey) ?? null));
        if (!m.instruments.length)
          setError('No tradable instrument found. Choose a specific trading symbol in chat.');
      })
      .catch((e: unknown) => {
        if (!ctl.signal.aborted) {
          if (e instanceof SessionExpiredError) callbacks.current.onSessionLost?.(e);
          setError(e instanceof Error ? e.message : 'Could not load the instrument. Try again.');
        }
      })
      .finally(() => {
        if (!ctl.signal.aborted) setLoading(false);
      });
    return () => ctl.abort();
  }, [context, fixture, attempt]);

  const sdkReady = () => window.KiteConnect?.ready(() => setReady(true));
  useEffect(() => {
    if (!fixture) sdkReady();
  }, [fixture]);

  useEffect(() => {
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const t = window.setTimeout(
      () =>
        host.current?.querySelector<HTMLButtonElement>('.go7:not(:disabled),[data-k="side"],.x7')?.focus(),
      30,
    );
    const key = (e: KeyboardEvent) => {
      // The official Publisher overlay handles its own keyboard events.
      if (document.getElementById('kite-modal-wrap')) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        callbacks.current.onClose();
      }
      if (e.key !== 'Tab') return;
      const nodes = Array.from(
        host.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input:not(:disabled),select,a[href]',
        ) ?? [],
      ).filter((x) => x.getClientRects().length);
      const first = nodes[0],
        last = nodes.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', key, true);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('keydown', key, true);
      before?.focus();
    };
  }, []);

  useEffect(() => {
    if (view !== 'window' || fixture) return;
    const poll = window.setInterval(() => {
      const p = publisher.current;
      if (p && (p.popup?.closed || (p.inline && !document.getElementById('kite-modal-wrap'))))
        setView('closed');
    }, 500);
    return () => window.clearInterval(poll);
  }, [view, fixture]);

  const set = <K extends keyof TicketForm>(key: K, value: TicketForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const entry = ticketEntry(form, instrument);
  const launch = () => {
    if (!entry) return;
    if (fixture) {
      setView('window');
      return;
    }
    if (!ready || !apiKey) return;
    try {
      const p = publisherAction(apiKey, entry, () => setView('closed'));
      publisher.current = p;
      setView(p.blocked ? 'blocked' : 'window');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kite’s window didn’t open. Try again.');
    }
  };
  const pick = (key: string) => {
    const item = market?.instruments.find((x) => x.key === key) ?? null;
    setSelected(key);
    setForm((f) => ({ ...initialTicket(context, item), side: f.side, orderType: f.orderType }));
  };
  const label =
    context.from === 'answer'
      ? 'From the answer'
      : context.from === 'email'
        ? 'From your alert email'
        : 'From your watcher';
  const hint = context.rule && watcherSide(context.rule) === form.side && form.side === 'BUY';
  const prods = instrument?.kind === 'equity' ? (['CNC', 'MIS'] as const) : (['NRML', 'MIS'] as const);
  const names = { CNC: 'Delivery', MIS: 'Intraday', NRML: 'Carry forward' };
  const summary = ticketSummary(form, instrument);
  const again = () => setView('form');
  const finish = view === 'closed';
  const blocked = view === 'blocked';
  const isWindow = view === 'window';
  const fallback = context.prefill ?? tradeFormFor(context.symbol, context.exchange ?? 'NSE');
  const fallbackPath = tradePath({ ...fallback, side: form.side || fallback.side });

  return (
    <div
      aria-labelledby="tk7h"
      aria-modal="true"
      className={`tk7s is-on${isWindow ? ' is-win' : ''}`}
      id="tk7s"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      ref={host}
      role="dialog"
    >
      {!fixture ? (
        <Script
          onError={() => setError('Could not load the Kite button. Check your connection and try again.')}
          onReady={sdkReady}
          src={`https://kite.trade/publisher.js?v=3${attempt ? `&retry=${attempt}` : ''}`}
          strategy="afterInteractive"
        />
      ) : null}
      <div className="tk7">
        <div className="hd7">
          <h2 id="tk7h">Trade on Kite</h2>
          <small>read-only</small>
          <button aria-label="Close" className="x7" data-k="close" onClick={onClose} type="button">
            <Icon name="close" />
          </button>
        </div>
        <div className="bd7">
          {view === 'form' ? (
            <>
              <div className="sy7">
                <b>{instrument?.displayName ?? instrument?.symbol ?? context.symbol}</b>
                <span className="ex">{instrument?.exchange ?? context.exchange ?? ''}</span>
                <span className="px">
                  {instrument?.lastPrice != null ? money(instrument.lastPrice) : '—'}
                  <small>{quoteTime(instrument?.asOf ?? null)}</small>
                </span>
                <span className="fr">
                  <Icon
                    name={context.from === 'answer' ? 'chat' : context.from === 'email' ? 'mail' : 'bell'}
                  />
                  {label} · {context.label}
                </span>
              </div>
              {loading ? (
                <p className="trade-note" role="status">
                  Loading the instrument and last price…
                </p>
              ) : null}
              {market &&
              (!market.selectedKey || market.instruments.length > 1) &&
              market.instruments.length ? (
                <div className="fd7">
                  <label htmlFor="contract7">Choose the instrument or contract</label>
                  <select id="contract7" onChange={(e) => pick(e.target.value)} value={selected}>
                    <option value="">Pick a contract</option>
                    {market.instruments.map((x) => (
                      <option key={x.key} value={x.key}>
                        {x.symbol} · {x.exchange}
                        {x.expiry ? ` · ${x.expiry}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              {error ? (
                <div className="trade-note" role="alert">
                  {error}{' '}
                  {onReconnect && /reconnect/i.test(error) ? (
                    <button
                      onClick={() => {
                        onClose();
                        onReconnect();
                      }}
                      type="button"
                    >
                      Reconnect Kite
                    </button>
                  ) : (
                    <button onClick={() => setAttempt((x) => x + 1)} type="button">
                      Try again
                    </button>
                  )}
                  {' · '}
                  <a href={fallbackPath}>Open full order form</a>
                </div>
              ) : null}
              <div className="fd7">
                <span className="l">Buy or sell{!form.side ? <em>pick one</em> : null}</span>
                <div aria-label="Buy or sell" className="sg7 bs7 tall" role="group">
                  {(['BUY', 'SELL'] as const).map((s) => (
                    <button
                      aria-pressed={form.side === s}
                      className={form.side === s ? 'is-on' : undefined}
                      data-k="side"
                      data-v={s}
                      key={s}
                      onClick={() => set('side', s)}
                      type="button"
                    >
                      {s === 'BUY' ? 'Buy' : 'Sell'}
                    </button>
                  ))}
                </div>
                {hint ? (
                  <div className="hn7">
                    Set to Buy because your watcher looks for a drop. Change it if you want.
                  </div>
                ) : null}
              </div>
              <div className="fd7 r7">
                <div>
                  <label htmlFor="q7">
                    {instrument && instrument.lotSize > 1 ? (
                      <>
                        Lots<em>1 lot = {instrument.lotSize}</em>
                      </>
                    ) : (
                      'Quantity'
                    )}
                  </label>
                  <div className="st7">
                    <button
                      aria-label="Less"
                      data-k="qm"
                      onClick={() =>
                        set(
                          'quantity',
                          String(badQuantity(form.quantity) ? 1 : Math.max(1, Number(form.quantity) - 1)),
                        )
                      }
                      type="button"
                    >
                      −
                    </button>
                    <input
                      aria-describedby="q7-error"
                      aria-invalid={badQuantity(form.quantity)}
                      id="q7"
                      inputMode="numeric"
                      onChange={(e) => set('quantity', e.target.value)}
                      value={form.quantity}
                    />
                    <button
                      aria-label="More"
                      data-k="qp"
                      onClick={() =>
                        set('quantity', String(badQuantity(form.quantity) ? 1 : Number(form.quantity) + 1))
                      }
                      type="button"
                    >
                      +
                    </button>
                  </div>
                  <small className="err7" hidden={!badQuantity(form.quantity)} id="q7-error">
                    {instrument && instrument.lotSize > 1
                      ? 'Enter at least 1 lot.'
                      : 'Enter a whole number of 1 or more.'}
                  </small>
                </div>
                <div>
                  <label htmlFor="p7">
                    Price<em>{form.orderType === 'LIMIT' ? 'limit' : 'at market'}</em>
                  </label>
                  <div className={`pr7${form.orderType === 'MARKET' ? ' is-off' : ''}`}>
                    <span>₹</span>
                    <input
                      aria-describedby="p7-error"
                      aria-invalid={badPrice(form)}
                      disabled={form.orderType === 'MARKET'}
                      id="p7"
                      inputMode="decimal"
                      onChange={(e) => set('price', e.target.value)}
                      value={
                        form.orderType === 'LIMIT'
                          ? form.price
                          : instrument?.lastPrice != null
                            ? money(instrument.lastPrice)
                            : '—'
                      }
                    />
                  </div>
                  <small className="err7" hidden={!badPrice(form)} id="p7-error">
                    Enter a price above ₹0.
                  </small>
                </div>
              </div>
              <div className="fd7">
                <span className="l">Order type</span>
                <div aria-label="Order type" className="sg7" role="group">
                  {(['MARKET', 'LIMIT'] as const).map((t) => (
                    <button
                      aria-pressed={form.orderType === t}
                      className={form.orderType === t ? 'is-on' : undefined}
                      data-k="type"
                      data-v={t}
                      key={t}
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          orderType: t,
                          price: t === 'LIMIT' ? String(instrument?.lastPrice ?? '') : f.price,
                        }))
                      }
                      type="button"
                    >
                      {t === 'MARKET' ? 'Market' : 'Limit'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="fd7">
                <span className="l">Product</span>
                <div aria-label="Product" className="sg7 tall" role="group">
                  {prods.map((p) => (
                    <button
                      aria-pressed={form.product === p}
                      className={form.product === p ? 'is-on' : undefined}
                      data-k="prod"
                      data-v={p}
                      key={p}
                      onClick={() => set('product', p)}
                      type="button"
                    >
                      {p}
                      <small>{names[p]}</small>
                    </button>
                  ))}
                </div>
              </div>
              {instrument && !(prods as readonly string[]).includes(form.product) ? (
                <p className="trade-note" role="alert">
                  Pick a product for this instrument to continue.
                </p>
              ) : null}
              <div className="sm7">
                <span>Order value, about</span>
                <b>{orderValue(form, instrument)}</b>
              </div>
              <button
                className={`go7${form.side === 'SELL' ? ' sell' : ''}`}
                data-k="go"
                disabled={!entry || !ready || (!fixture && !apiKey) || loading}
                onClick={launch}
                type="button"
              >
                <KiteWhite />
                {!form.side
                  ? 'Pick Buy or Sell'
                  : !fixture && !apiKey
                    ? 'Kite Publisher is not configured'
                    : !ready
                      ? 'Loading the Kite button…'
                      : `${form.side === 'SELL' ? 'Sell' : 'Buy'} on Kite`}
              </button>
              <p className="nt7">
                Kite opens in its own window. You check the order and place it there. /markets never sees or
                sends the order. Kite shows the exact margin and charges.
              </p>
              <div className="lg7">Facts from market data. Not investment advice.</div>
            </>
          ) : (
            <>
              <div className={`ms7${finish ? ' ok' : blocked ? ' er' : ''}`}>
                <div className="ic">
                  {isWindow ? <span className="sp" /> : <Icon name={finish ? 'check' : 'warn'} />}
                </div>
                <h3>
                  {finish
                    ? 'Kite’s window closed'
                    : blocked
                      ? 'Kite’s window didn’t open'
                      : 'Finish in Kite’s window'}
                </h3>
                <p>
                  {finish
                    ? 'If you placed the order, it’s in your Kite order book. /markets can’t see orders, so we can’t tell you if it went through.'
                    : blocked
                      ? 'Your browser blocked it. Use Safari or Chrome, or allow pop-ups for slash.markets, then try again.'
                      : 'Log in if Kite asks, check the order, and place it there.'}
                </p>
              </div>
              <div className="od7">
                <span>{summary}</span>
              </div>
              {finish ? (
                <>
                  <div className="bt7">
                    <button
                      data-k="orders"
                      onClick={() =>
                        window.open('https://kite.zerodha.com/orders', '_blank', 'noopener,noreferrer')
                      }
                      type="button"
                    >
                      Open Kite orders
                    </button>
                    <button className="p" data-k="close" onClick={onClose} type="button">
                      Done
                    </button>
                  </div>
                  <div className="ln7" style={{ textAlign: 'center' }}>
                    <button data-k="again" onClick={again} type="button">
                      Trade again
                    </button>
                  </div>
                </>
              ) : blocked ? (
                <div className="bt7">
                  <button data-k="again" onClick={again} type="button">
                    Change order
                  </button>
                  <button className="p" data-k="go" onClick={launch} type="button">
                    Try again
                  </button>
                </div>
              ) : (
                <>
                  <div className="ln7" style={{ textAlign: 'center' }}>
                    <button data-k="focus" onClick={() => publisher.current?.popup?.focus()} type="button">
                      Bring Kite’s window back
                    </button>{' '}
                    ·{' '}
                    <button data-k="close" onClick={onClose} type="button">
                      Cancel
                    </button>
                  </div>
                  <div className="lg7">/markets can’t see what you do in Kite’s window.</div>
                </>
              )}
            </>
          )}
        </div>
      </div>
      {fixture && isWindow ? (
        <div aria-label="Kite’s window (stand-in)" className="kw7" role="region">
          <div className="bar">
            <i />
            <i />
            <i />
            <span>
              <Icon name="lock" />
              kite.zerodha.com/connect/basket
            </span>
          </div>
          <div className="bd">
            <div style={{ width: '100%' }}>
              <div className="cap">Kite’s own window · stand-in, not our design</div>
              <div className="sk">
                <i />
                <i />
                <i />
                <i />
              </div>
              <h4>{summary}</h4>
              <p>
                Kite shows its login if needed, then the order with margin and charges. They place it here. We
                never see this page.
              </p>
              <button data-k="kclose" onClick={() => setView('closed')} type="button">
                Close this window
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
