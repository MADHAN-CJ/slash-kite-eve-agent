'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChatShell, type ShellSession } from '@/components/v2/chat/chat-shell';
import { AnswerMessage, UserMessage } from '@/components/v2/chat/answer';
import { TradeDialog, type TradeView } from '@/components/v2/chat/trade-dialog';
import { labTrade } from '@/lib/v2/lab-trade';
import { buildAnswer } from '@/lib/v2/answer-model';
import '@/styles/v2/trade.css';

export function TradeLab({ state }: { readonly state: string }) {
  const [sessions, setSessions] = useState<ShellSession[]>([]);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(true);
  const [epoch, setEpoch] = useState(0);
  const fixture = useMemo(() => labTrade(state), [state]);
  useEffect(() => {
    const now = Date.now();
    setSessions([
      { id: 'o0', title: 'GOLDBEES levels this week', updatedAt: new Date(now - 6e4).toISOString() },
      { id: 'o1', title: 'Nifty levels for Thursday expiry', updatedAt: new Date(now - 36e5).toISOString() },
      { id: 'o2', title: 'Crude oil range this week', updatedAt: new Date(now - 864e5).toISOString() },
      { id: 'o3', title: 'Bank Nifty RSI on 15 min', updatedAt: new Date(now - 2 * 864e5).toISOString() },
    ]);
    document.documentElement.dataset.state = state;
    setReady(true);
  }, [state]);
  const answer = useMemo(
    () =>
      buildAnswer({
        text: 'GOLDBEES is at **99.82**, just under 100. It went below at **14:05** and has not closed back above since.',
        tools: [],
        streaming: false,
      }),
    [],
  );
  if (!ready) return null;
  const reopen = () => {
    setEpoch((x) => x + 1);
    setOpen(true);
  };
  return (
    <>
      <ChatShell
        auth="kite"
        busy={false}
        creditsLeft={64}
        currentId="o0"
        empty={false}
        onAccount={() => {}}
        onAsk={() => {}}
        onConnectKite={() => {}}
        onDeleteChat={() => {}}
        onNewChat={() => {}}
        onOpenChat={() => {}}
        onStop={() => {}}
        onWatchers={() => {}}
        sessions={sessions}
        title="GOLDBEES levels this week"
      >
        <UserMessage index={0} text="Where is GOLDBEES against 100 today?" />
        <AnswerMessage index={1} model={answer} onTrade={reopen} />
      </ChatShell>
      {open ? (
        <TradeDialog
          apiKey={null}
          context={fixture.context}
          fixture={fixture.market}
          initialView={(['window', 'closed', 'blocked'].includes(state) ? state : 'form') as TradeView}
          invalid={state === 'invalid-order'}
          key={epoch}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
