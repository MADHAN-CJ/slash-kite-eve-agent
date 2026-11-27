'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChatShell, type ShellSession } from '@/components/v2/chat/chat-shell';
import { AnswerMessage, UserMessage } from '@/components/v2/chat/answer';
import { AccountPanel } from '@/components/v2/chat/account-panel';
import { toast } from '@/components/v2/chat/toast';
import { labAccount } from '@/lib/v2/lab-account';
import { buildAnswer } from '@/lib/v2/answer-model';
import '@/styles/v2/account.css';

/** Timer-based account behavior belongs only to this fixture route. */
export function AccountLab({ state }: { readonly state: string }) {
  const [data, setData] = useState(() => labAccount(state));
  const [sessions, setSessions] = useState<ShellSession[]>([]);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const timer = useRef(0);
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
    const t = window.setTimeout(() => setOpen(true), 250);
    return () => {
      window.clearTimeout(t);
      window.clearTimeout(timer.current);
    };
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
  const setState = (s: string) => {
    document.documentElement.dataset.state = s;
  };
  const connect = () => {
    if (data.kite.waiting) return;
    setState('wait');
    setData((d) => ({ ...d, kite: { ...d.kite, waiting: true, failed: false } }));
    timer.current = window.setTimeout(() => {
      if (!navigator.onLine) {
        setState('reconnect-failed');
        setData((d) => ({ ...d, kite: { ...d.kite, waiting: false, failed: true } }));
        return;
      }
      setState('on');
      setData((d) => ({ ...d, kite: labAccount('on').kite }));
      toast('Kite connected until 6:00 AM tomorrow. Your 5 watchers are running again.', 3200);
    }, 2200);
  };
  const cancel = () => {
    window.clearTimeout(timer.current);
    setState(data.kite.kind === 'out' ? 'out' : data.kite.expired ? 'expired' : 'morning');
    setData((d) => ({ ...d, kite: { ...d.kite, waiting: false } }));
  };
  if (!ready) return null;
  const on = data.kite.kind === 'on';
  const out = data.kite.kind === 'out';
  const status = on
    ? 'Kite connected · until 6:00 AM'
    : out
      ? 'Kite disconnected'
      : data.kite.expired
        ? 'Kite session expired'
        : 'Kite ended at 6:00 AM';
  return (
    <>
      <ChatShell
        auth={on ? 'kite' : 'ended'}
        busy={false}
        creditsLeft={100 - data.usage.usedPct}
        currentId="o0"
        empty={false}
        gate={
          on
            ? undefined
            : {
                text: out
                  ? 'Kite is disconnected. Connect to ask.'
                  : data.kite.expired
                    ? 'Kite session expired. Reconnect to ask.'
                    : 'Kite session ended at 6:00. Reconnect to ask.',
                action: out ? 'Connect Kite' : 'Reconnect Kite',
                onAction: () => {
                  setOpen(true);
                  connect();
                },
              }
        }
        statusLine={
          <>
            <i />
            {status}
          </>
        }
        onAccount={() => setOpen(true)}
        onAsk={() => {}}
        onConnectKite={() => setOpen(true)}
        onDeleteChat={() => {}}
        onNewChat={() => {}}
        onOpenChat={() => {}}
        onStop={() => {}}
        onWatchers={() => {}}
        sessions={sessions}
        title="GOLDBEES levels this week"
      >
        <UserMessage index={0} text="Where is GOLDBEES against 100 today?" />
        <AnswerMessage index={1} model={answer} />
      </ChatShell>
      <AccountPanel
        open={open}
        autoFocus={false}
        email="you@example.com"
        kite={data.kite}
        usage={data.usage}
        connectorUrl="https://slash.markets/mcp"
        chatGpt={{ title: 'In review', description: 'We’ll email you when it’s ready.' }}
        onClose={() => setOpen(false)}
        onConnect={connect}
        onCancelConnect={cancel}
        onDisconnect={() => {
          setData((d) => ({ ...d, kite: labAccount('out').kite }));
          toast('Kite disconnected. Chat and watchers are paused.', 3200);
        }}
        onSignOut={() => {
          window.location.href = '/lab/homepage?s=open';
        }}
      />
    </>
  );
}
