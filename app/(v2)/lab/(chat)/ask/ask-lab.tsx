'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnswerMessage, UserMessage } from '@/components/v2/chat/answer';
import { ChatShell, type ShellAuth, type ShellSession } from '@/components/v2/chat/chat-shell';
import { type ComposerHandle, isWatchIntent } from '@/components/v2/chat/composer';
import { SourcesList, SourcesPane } from '@/components/v2/chat/sources-panel';
import { toast } from '@/components/v2/chat/toast';
import { useWatchThis } from '@/components/v2/chat/use-watch-this';
import { WatcherConfirmCard } from '@/components/v2/chat/watcher-card';
import type { AnswerModel } from '@/lib/v2/answer-model';
import { NO_DATA_Q, Q, replay, type ReplayKind } from '@/lib/v2/lab-replay';

/**
 * The `ask` flow from fixtures — the same made-up chats the prototype seeds
 * (markets-hero ux/flows/ask/index.html) and its runs replayed with the
 * prototype's timings (lib/v2/lab-replay.ts): the Reliance answer, Watch
 * this, and a watcher question that ends on the confirm card. Nothing here
 * reaches a server.
 */

const HOUR = 36e5;
const DRAFT = 'Show every day RELIANCE closed above its 20-day high this year';
const REPLAYED: ReplayKind[] = ['run', 'answer', 'stopped', 'timeout', 'kite-expired', 'no-market-data'];

interface Turn {
  q: string;
  model: AnswerModel | null;
}

function seed(now: number): ShellSession[] {
  return [
    { id: 'o1', title: 'Nifty levels for Thursday expiry', updatedAt: new Date(now - HOUR).toISOString(), searchText: 'Nifty is holding above 24,180. The next level above is 24,420.' },
    { id: 'o2', title: 'Crude oil range this week', updatedAt: new Date(now - 24 * HOUR).toISOString(), searchText: 'Crude has stayed between 6,310 and 6,480 this week.' },
    { id: 'o3', title: 'Bank Nifty RSI on 15 min', updatedAt: new Date(now - 48 * HOUR).toISOString(), searchText: 'RSI on the 15 minute chart is 58. It is neither high nor low.' },
  ];
}

/** The next 6:00 AM on this device — when Kite ends every session. */
function nextSixAm(now: number): Date {
  const end = new Date(now);
  end.setHours(6, 0, 0, 0);
  if (end.getTime() <= now) end.setDate(end.getDate() + 1);
  return end;
}

export function AskLab({ state }: { readonly state: string }) {
  const [sessions, setSessions] = useState<ShellSession[]>([]);
  const [kiteUntil, setKiteUntil] = useState<Date | null>(null);
  const [view, setView] = useState<'chat' | 'watchers'>('chat');
  const [ready, setReady] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [pulseKey, setPulseKey] = useState(0);
  const [auth, setAuth] = useState<ShellAuth>('kite');
  const [currentId, setCurrentId] = useState<string | null>(null);
  const dock = useRef<ComposerHandle>(null);
  const stopRef = useRef<() => void>(() => {});
  const watchThis = useWatchThis(dock, busy);

  // Dates are read after mount so the server render and the browser agree.
  useEffect(() => {
    const now = Date.now();
    setSessions(seed(now));
    setKiteUntil(nextSixAm(now));
    document.documentElement.dataset.state = state;
    setReady(true);
  }, [state]);

  const setLast = (m: AnswerModel | null) => setTurns((prev) => (prev.length ? [...prev.slice(0, -1), { ...prev[prev.length - 1], model: m }] : prev));

  /** `replace` re-runs the last question in place (redo); otherwise the question is a new turn. */
  const start = (kind: ReplayKind, q: string, replace = false) => {
    stopRef.current();
    watchThis.close();
    setTurns((prev) => (replace && prev.length ? [...prev.slice(0, -1), { q, model: null }] : [...prev, { q, model: null }]));
    setBusy(true);
    setPulseKey((k) => k + 1);
    setAuth('kite');
    // The prototype saves the chat as soon as the question is sent: it tops the list, selected.
    setCurrentId((cur) => {
      const id = cur ?? 'c-lab'; // one fixed id: a double-invoked effect (dev StrictMode) must not add a second row
      setSessions((prev) => (prev.some((s) => s.id === id) ? prev : [{ id, title: q.slice(0, 52), updatedAt: new Date().toISOString() }, ...prev]));
      return id;
    });
    stopRef.current = replay(kind, ({ model: m, done }) => {
      setLast(m);
      if (done) {
        setBusy(false);
        if (m.kiteExpired) setAuth('ended');
      }
    });
  };
  const ask = (text: string) => start(isWatchIntent(text) && /\b(below|above|under|over)\b/i.test(text) ? 'watch' : 'answer', text);

  // biome-ignore lint/correctness/useExhaustiveDependencies: one replay per state
  useEffect(() => {
    if (!ready) return;
    if (REPLAYED.includes(state as ReplayKind)) start(state as ReplayKind, state === 'no-market-data' ? NO_DATA_Q : Q);
    return () => stopRef.current();
  }, [ready, state]);

  const draft = useMemo(() => (state === 'draft' ? DRAFT : ''), [state]);
  if (!ready) return null;

  const expired = auth === 'ended';
  const last = turns[turns.length - 1]?.model ?? null;
  const panelSources = !busy && last?.status === 'done' ? last.sources : [];
  const stop = () => {
    stopRef.current();
    setBusy(false);
    setTurns((prev) =>
      prev.map((t, i) =>
        i === prev.length - 1 && t.model ? { ...t, model: { ...t.model, status: 'stopped', steps: t.model.steps.map((s) => (s.status === 'ok' ? s : { ...s, status: 'stopped' })) } } : t,
      ),
    );
  };
  const setCard = (i: number, cardState: 'live' | 'declined') =>
    setTurns((prev) => prev.map((t, k) => (k === i && t.model?.watcher ? { ...t, model: { ...t.model, watcher: { ...t.model.watcher, state: cardState } } } : t)));

  return (
    <ChatShell
      auth={auth}
      busy={busy}
      composerDisabled={expired}
      composerPlaceholder={expired ? 'Reconnect Kite to ask' : undefined}
      creditsLeft={64}
      currentId={currentId}
      dockAbove={watchThis.panel}
      dockRef={dock}
      draft={draft}
      empty={turns.length === 0}
      gate={expired ? { text: 'Your Kite session expired during this answer.', action: 'Reconnect Kite', onAction: () => setAuth('kite') } : undefined}
      hasSources={busy || panelSources.length > 0}
      kiteUntil={kiteUntil}
      onAccount={() => {}}
      onAsk={ask}
      onConnectKite={() => setAuth('kite')}
      onDeleteChat={(id) => setSessions((prev) => prev.filter((s) => s.id !== id))}
      onNewChat={() => {
        stopRef.current();
        watchThis.close();
        setTurns([]);
        setBusy(false);
        setCurrentId(null);
        setView('chat');
      }}
      onOpenChat={() => setView('chat')}
      onRenameChat={(id, title) => setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, title } : s)))}
      onStop={stop}
      onWatchers={() => setView('watchers')}
      pulseKey={pulseKey}
      sessions={sessions}
      sourcesPane={<SourcesPane loading={busy} sources={panelSources} />}
      sourcesPanel={<SourcesList loading={busy} sources={panelSources} />}
      statusLine={expired ? 'Kite session expired' : undefined}
      title={turns[0] ? turns[0].q.slice(0, 52) : ''}
      view={view}
    >
      {turns.map((t, i) => (
        <div key={`${i}:${t.q}`} style={{ display: 'contents' }}>
          <UserMessage index={i * 2} text={t.q} />
          {t.model ? (
            <AnswerMessage
              afterFirstParagraph={
                t.model.watcher ? (
                  <WatcherConfirmCard
                    card={t.model.watcher}
                    onChange={(_c, q) => {
                      setCard(i, 'declined');
                      watchThis.prefill(q, (q.match(/\d[\d,]*/) ?? [''])[0] || undefined);
                    }}
                    onOpenWatchers={() => setView('watchers')}
                    onStart={() => {
                      setCard(i, 'live');
                      toast('Watcher started. It keeps running after you close this chat.');
                    }}
                    onTrade={() => toast('Trade on Kite comes with a later phase.')}
                    question={t.q}
                  />
                ) : undefined
              }
              index={i * 2 + 1}
              model={t.model}
              onEditQuestion={() => dock.current?.setValue(NO_DATA_Q)}
              onFollowup={ask}
              onRetry={() => start('answer', t.q, true)}
              onWatch={(sym) => t.model && watchThis.watchFrom(t.model, sym)}
            />
          ) : null}
        </div>
      ))}
    </ChatShell>
  );
}
