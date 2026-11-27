'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnswerMessage, UserMessage } from '@/components/v2/chat/answer';
import { ChatShell, type ShellAuth, type ShellSession } from '@/components/v2/chat/chat-shell';
import type { ComposerHandle } from '@/components/v2/chat/composer';
import { SourcesList, SourcesPane } from '@/components/v2/chat/sources-panel';
import type { AnswerModel } from '@/lib/v2/answer-model';
import { NO_DATA_Q, Q, replay, type ReplayKind } from '@/lib/v2/lab-replay';

/**
 * The `ask` flow from fixtures — the same made-up chats the prototype seeds
 * (markets-hero ux/flows/ask/index.html) and its Reliance run replayed with
 * the prototype's timings (lib/v2/lab-replay.ts). Nothing here reaches a server.
 */

const HOUR = 36e5;
const DRAFT = 'Show every day RELIANCE closed above its 20-day high this year';
const REPLAYED: ReplayKind[] = ['run', 'answer', 'stopped', 'timeout', 'kite-expired', 'no-market-data'];

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
  const [question, setQuestion] = useState<string | null>(null);
  const [model, setModel] = useState<AnswerModel | null>(null);
  const [busy, setBusy] = useState(false);
  const [pulseKey, setPulseKey] = useState(0);
  const [auth, setAuth] = useState<ShellAuth>('kite');
  const dock = useRef<ComposerHandle>(null);
  const stopRef = useRef<() => void>(() => {});

  // Dates are read after mount so the server render and the browser agree.
  useEffect(() => {
    const now = Date.now();
    setSessions(seed(now));
    setKiteUntil(nextSixAm(now));
    document.documentElement.dataset.state = state;
    setReady(true);
  }, [state]);

  const [currentId, setCurrentId] = useState<string | null>(null);
  const start = (kind: ReplayKind, q: string) => {
    stopRef.current();
    setQuestion(q);
    // The prototype saves the chat as soon as the question is sent: it tops the list, selected.
    setCurrentId((cur) => {
      const id = cur ?? 'c-lab'; // one fixed id: a double-invoked effect (dev StrictMode) must not add a second row
      setSessions((prev) => (prev.some((s) => s.id === id) ? prev : [{ id, title: q.slice(0, 52), updatedAt: new Date().toISOString() }, ...prev]));
      return id;
    });
    setModel(null);
    setBusy(true);
    setPulseKey((k) => k + 1);
    setAuth('kite');
    stopRef.current = replay(kind, ({ model: m, done }) => {
      setModel(m);
      if (done) {
        setBusy(false);
        if (m.kiteExpired) setAuth('ended');
      }
    });
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: one replay per state
  useEffect(() => {
    if (!ready) return;
    if (REPLAYED.includes(state as ReplayKind)) start(state as ReplayKind, state === 'no-market-data' ? NO_DATA_Q : Q);
    return () => stopRef.current();
  }, [ready, state]);

  const draft = useMemo(() => (state === 'draft' ? DRAFT : ''), [state]);
  if (!ready) return null;

  const expired = auth === 'ended';
  // The side panel shows the latest finished answer's requests, or a skeleton while one runs.
  const loading = busy;
  const panelSources = !busy && model?.status === 'done' ? model.sources : [];
  const stop = () => {
    stopRef.current();
    setBusy(false);
    setModel((m) => (m ? { ...m, status: 'stopped', steps: m.steps.map((s) => (s.status === 'ok' ? s : { ...s, status: 'stopped' })) } : m));
  };

  return (
    <ChatShell
      auth={auth}
      busy={busy}
      composerDisabled={expired}
      composerPlaceholder={expired ? 'Reconnect Kite to ask' : undefined}
      creditsLeft={64}
      currentId={currentId}
      dockRef={dock}
      draft={draft}
      empty={question === null}
      hasSources={loading || panelSources.length > 0}
      sourcesPane={<SourcesPane loading={loading} sources={panelSources} />}
      sourcesPanel={<SourcesList loading={loading} sources={panelSources} />}
      gate={expired ? { text: 'Your Kite session expired during this answer.', action: 'Reconnect Kite', onAction: () => setAuth('kite') } : undefined}
      kiteUntil={kiteUntil}
      onAccount={() => {}}
      onAsk={(text) => start('answer', text)}
      onConnectKite={() => setAuth('kite')}
      onDeleteChat={(id) => setSessions((prev) => prev.filter((s) => s.id !== id))}
      onNewChat={() => {
        stopRef.current();
        setQuestion(null);
        setModel(null);
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
      statusLine={expired ? 'Kite session expired' : undefined}
      title={question ? question.slice(0, 52) : ''}
      view={view}
    >
      {question !== null ? <UserMessage index={0} text={question} /> : null}
      {model ? (
        <AnswerMessage
          index={1}
          model={model}
          onEditQuestion={() => dock.current?.setValue(NO_DATA_Q)}
          onFollowup={(t) => start('answer', t)}
          onRetry={() => start('answer', question ?? Q)}
        />
      ) : null}
    </ChatShell>
  );
}
