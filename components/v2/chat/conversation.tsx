'use client';

import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useEveAgent, type EveMessage } from 'eve/react';
import { authHeaders } from '@/lib/client/settings';
import type { ApiMessage } from '@/lib/client/threads-api';
import type { AnswerModel } from '@/lib/v2/answer-model';
import { callTimes, liveAnswer, storedAnswer } from '@/lib/v2/answer-parts';
import { AnswerMessage, UserMessage } from './answer';
import { ChatShell, type ChatShellProps } from './chat-shell';
import type { ComposerHandle } from './composer';
import { SourcesList, SourcesPane } from './sources-panel';
import { toast } from './toast';

/**
 * One conversation on the v2 shell: the persisted history (from our DB)
 * followed by the live eve session, every assistant turn reduced to the
 * answer model the run renders. Mounted keyed by thread — a resumed thread
 * passes `session` so the hook attaches after the history it already shows.
 * All eve traffic goes through the app proxy (`host: "/api"`), which owns
 * the MCP grant and continuation tokens.
 */

type ShellPassthrough = Omit<
  ChatShellProps,
  'busy' | 'empty' | 'title' | 'children' | 'onAsk' | 'onStop' | 'hasSources' | 'sourcesPanel' | 'sourcesPane' | 'dockRef' | 'heroRef' | 'pulseKey' | 'onShare'
>;

export function Conversation({
  history,
  session,
  title,
  onSessionCreated,
  onTurnSettled,
  onKiteExpired,
  queued,
  onQueuedSent,
  afterThread,
  ...shell
}: ShellPassthrough & {
  readonly history: ApiMessage[];
  readonly session?: { sessionId: string; streamIndex: number };
  readonly title: string | null;
  readonly onSessionCreated?: (eveSessionId: string) => void;
  readonly onTurnSettled?: () => void;
  readonly onKiteExpired?: () => void;
  /** A question saved behind the Kite gate: sent once, as soon as the box is open. */
  readonly queued?: { text: string; n: number } | null;
  readonly onQueuedSent?: () => void;
  /** Rendered after the messages (the "Kite connected at …" line). */
  readonly afterThread?: ReactNode;
}) {
  const agent = useEveAgent({
    host: '/api',
    headers: () => authHeaders(),
    maxReconnectAttempts: 20,
    onError: (error) => console.warn('[markets] stream error:', error),
    initialSession: session ? { sessionId: session.sessionId, continuationToken: 'proxy-managed', streamIndex: session.streamIndex } : undefined,
  });
  const busy = agent.status === 'submitted' || agent.status === 'streaming';
  const [pulseKey, setPulseKey] = useState(0);
  const [stoppedIds, setStoppedIds] = useState<Set<string>>(() => new Set());
  const dock = useRef<ComposerHandle>(null);
  const hero = useRef<ComposerHandle>(null);

  const announced = useRef(false);
  const liveSessionId = agent.session?.sessionId;
  useEffect(() => {
    if (!session && liveSessionId && !announced.current) {
      announced.current = true;
      onSessionCreated?.(liveSessionId);
    }
  }, [session, liveSessionId, onSessionCreated]);

  const wasBusy = useRef(false);
  useEffect(() => {
    if (wasBusy.current && !busy) onTurnSettled?.();
    wasBusy.current = busy;
  }, [busy, onTurnSettled]);

  const ask = useCallback(
    (text: string) => {
      const t = text.trim();
      if (!t || busy) return;
      setPulseKey((k) => k + 1);
      void agent.send({ message: t });
    },
    [agent, busy],
  );

  const sentQueued = useRef<number | null>(null);
  useEffect(() => {
    if (!queued || busy || shell.composerGate || sentQueued.current === queued.n) return;
    sentQueued.current = queued.n;
    ask(queued.text);
    onQueuedSent?.();
  }, [queued, busy, shell.composerGate, ask, onQueuedSent]);

  const stop = useCallback(() => {
    const last = agent.data.messages[agent.data.messages.length - 1];
    if (last?.role === 'assistant') setStoppedIds((prev) => new Set(prev).add(last.id));
    agent.stop();
  }, [agent]);

  // Live assistant turns → answer models (the stream clock gives per-call timings).
  const times = useMemo(() => callTimes(agent.events), [agent.events]);
  const live = agent.data.messages;
  const lastId = live[live.length - 1]?.id;
  const models = useMemo(() => {
    const out = new Map<string, AnswerModel>();
    for (const m of live as readonly EveMessage[]) {
      if (m.role !== 'assistant') continue;
      const streaming = m.id === lastId && busy;
      const stopped = stoppedIds.has(m.id) || (!streaming && m.metadata?.status === 'streaming');
      const error = m.id === lastId && agent.error ? agent.error.message : m.metadata?.status === 'failed' ? 'The answer failed.' : undefined;
      out.set(m.id, liveAnswer(m, { streaming, stopped: stopped && !error, error, times }));
    }
    return out;
  }, [live, lastId, busy, stoppedIds, agent.error, times]);

  // A tool said the Zerodha session is over: tell the app once per answer.
  const expiredSeen = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const [id, m] of models) {
      if (m.kiteExpired && !expiredSeen.current.has(id)) {
        expiredSeen.current.add(id);
        onKiteExpired?.();
      }
    }
  }, [models, onKiteExpired]);

  const storedModels = useMemo(() => history.filter((m) => m.role === 'assistant').map((m) => [m.id, storedAnswer(m.content, m.parts, m.createdAt)] as const), [history]);
  const empty = history.length === 0 && live.length === 0;

  // The side panel: the latest finished answer's requests, or a skeleton while one runs.
  const latest = [...models.values()].reverse().find((m) => m.status === 'done') ?? storedModels[storedModels.length - 1]?.[1];
  const panelSources = latest?.sources ?? [];
  const lastQuestion = [...live].reverse().find((m) => m.role === 'user')?.parts.find((p) => p.type === 'text')?.text ?? [...history].reverse().find((m) => m.role === 'user')?.content ?? '';

  const share = async () => {
    const lines: string[] = [];
    for (const m of history) lines.push(`${m.role === 'user' ? 'You' : '/markets'}: ${m.content}`);
    for (const m of live) lines.push(`${m.role === 'user' ? 'You' : '/markets'}: ${m.parts.map((p) => (p.type === 'text' ? p.text : '')).join('')}`);
    await navigator.clipboard.writeText(lines.join('\n\n'));
  };

  const shownTitle = title ?? (lastQuestion ? lastQuestion.slice(0, 52) : '');
  const userText = (m: EveMessage) => m.parts.map((p) => (p.type === 'text' ? p.text : '')).join('');
  let index = 0;

  return (
    <ChatShell
      {...shell}
      busy={busy}
      dockRef={dock}
      empty={empty}
      hasSources={busy || panelSources.length > 0}
      heroRef={hero}
      onAsk={ask}
      onShare={share}
      onStop={stop}
      pulseKey={pulseKey}
      sourcesPane={<SourcesPane loading={busy} sources={busy ? [] : panelSources} />}
      sourcesPanel={<SourcesList loading={busy} sources={busy ? [] : panelSources} />}
      title={shownTitle}
    >
      {history.map((m) => {
        const i = index++;
        if (m.role === 'user') return <UserMessage index={i} key={m.id} text={m.content} />;
        const model = storedModels.find(([id]) => id === m.id)?.[1];
        return model ? (
          <AnswerMessage
            index={i}
            key={m.id}
            model={model}
            onEditQuestion={() => dock.current?.setValue(lastQuestion)}
            onFollowup={ask}
            onReconnect={shell.onConnectKite}
            onRetry={() => ask(lastQuestion)}
            onTrade={() => toast('Trade on Kite comes with a later phase.')}
            onWatch={(sym) => dock.current?.setValue(`Tell me when ${sym} `)}
          />
        ) : null;
      })}
      {live.map((m) => {
        const i = index++;
        if (m.role === 'user') return <UserMessage index={i} key={m.id} text={userText(m)} />;
        const model = models.get(m.id);
        return model ? (
          <AnswerMessage
            index={i}
            key={m.id}
            model={model}
            onEditQuestion={() => dock.current?.setValue(lastQuestion)}
            onFollowup={ask}
            onReconnect={shell.onConnectKite}
            onRetry={() => ask(lastQuestion)}
            onTrade={() => toast('Trade on Kite comes with a later phase.')}
            onWatch={(sym) => dock.current?.setValue(`Tell me when ${sym} `)}
          />
        ) : null;
      })}
      {afterThread}
    </ChatShell>
  );
}
