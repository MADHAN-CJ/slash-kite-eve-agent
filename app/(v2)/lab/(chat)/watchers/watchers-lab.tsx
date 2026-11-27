'use client';

import { useEffect, useState } from 'react';
import { ChatShell, type ShellSession } from '@/components/v2/chat/chat-shell';
import { toast } from '@/components/v2/chat/toast';
import { WatchersScreen } from '@/components/v2/chat/watchers-screen';
import type { WatchSummary } from '@/lib/server/watches';
import { alertEmailHtml, LAB_NOW, labWatchers, remindEmailHtml } from '@/lib/v2/lab-watchers';
import { toW8, type W8 } from '@/lib/v2/watcher-view';
import '@/styles/v2/watchers.css';

/**
 * The `watchers` flow from fixtures (lib/v2/lab-watchers.ts): the same
 * screen the app renders, on the prototype's made-up watchers. `email` and
 * `remind` preview the two emails as the prototype draws them; the real
 * templates are phase V11.
 */

const MAIL = 'you@example.com';
const HOUR = 36e5;

function seed(now: number): ShellSession[] {
  return [
    { id: 'o1', title: 'Nifty levels for Thursday expiry', updatedAt: new Date(now - HOUR).toISOString() },
    { id: 'o2', title: 'Crude oil range this week', updatedAt: new Date(now - 24 * HOUR).toISOString() },
    { id: 'o3', title: 'Bank Nifty RSI on 15 min', updatedAt: new Date(now - 48 * HOUR).toISOString() },
  ];
}

export function WatchersLab({ state }: { readonly state: string }) {
  const [list, setList] = useState<WatchSummary[]>([]);
  const [sessions, setSessions] = useState<ShellSession[]>([]);
  const [kiteEnded, setKiteEnded] = useState(state === 'kite');
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setList(labWatchers(state));
    setSessions(seed(Date.now()));
    document.documentElement.dataset.state = state;
    setReady(true);
  }, [state]);
  if (!ready) return null;

  const set = (id: string, patch: Partial<WatchSummary>) => setList((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const reconnect = () => {
    let n = 0;
    setList((prev) =>
      prev.map((x) => {
        if (x.status === 'PAUSED' && x.pausedBy === 'broker') {
          n++;
          return { ...x, status: 'ARMED', pausedBy: null, lastCheckedAt: null };
        }
        return x;
      }),
    );
    setKiteEnded(false);
    window.setTimeout(() => toast(`Kite connected until 6:00 AM tomorrow. ${n} watchers are running again. Each one’s next check sets a new baseline.`), 0);
  };
  const actions = {
    onPause: (w: W8) => {
      set(w.id, { status: 'PAUSED', pausedBy: 'user', lastMet: false, createdAt: new Date(0).toISOString() });
      toast(`${w.sym} paused. It stops checking until you resume.`);
    },
    onResume: (w: W8) => {
      set(w.id, { status: 'ARMED', pausedBy: null });
      toast(`${w.sym} is watching again. The next check sets a new baseline.`);
    },
    onCancel: (w: W8) => {
      set(w.id, { status: 'CANCELLED', pausedBy: null, updatedAt: LAB_NOW.toISOString() });
      toast(`${w.sym} cancelled. It moved to Finished.`);
    },
    onOpenChat: (w: W8) => toast(`Opens the chat “${w.chat}” with this watcher at the bottom.`),
    onTrade: () => toast('Trade on Kite comes with a later phase.'),
    onReconnect: reconnect,
    onFix: () => toast('Opens the chat with this script and the error, so the agent can fix it.'),
    onWatchAgain: (w: W8) => toast(`Opens a new chat with “Tell me when ${w.sym}: ${w.rule}” filled in.`),
    onAskExample: (q: string) => toast(`Starts a chat: ${q}`),
  };

  const email = state === 'email' || state === 'remind';
  const screen = email ? (
    <div
      className="w6"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: fixed lab markup, escaped
      dangerouslySetInnerHTML={{ __html: state === 'email' ? alertEmailHtml(MAIL) : remindEmailHtml(MAIL, list.filter((x) => x.status === 'PAUSED' && x.pausedBy === 'broker')) }}
      id="w6"
    />
  ) : (
    <WatchersScreen
      actions={actions}
      email={MAIL}
      headerNote={kiteEnded ? '26 Nov 06:12' : undefined}
      initialSelected={state === 'new' ? 'w1' : state === 'finished' ? 'w7' : 'w2'}
      initialTab={state === 'finished' ? 'done' : 'active'}
      watchers={list.map((x) => toW8(x, LAB_NOW))}
    />
  );

  return (
    <ChatShell
      auth={kiteEnded ? 'ended' : 'kite'}
      busy={false}
      creditsLeft={64}
      currentId={null}
      empty
      gate={kiteEnded ? { text: 'Kite session ended at 6:00. Your watchers are paused until you reconnect.', action: 'Reconnect Kite', onAction: reconnect } : undefined}
      kiteUntil={null}
      onAccount={() => {}}
      onAsk={() => {}}
      onConnectKite={reconnect}
      onDeleteChat={(id) => setSessions((prev) => prev.filter((s) => s.id !== id))}
      onNewChat={() => {}}
      onOpenChat={() => {}}
      onStop={() => {}}
      onWatchers={() => {}}
      sessions={sessions}
      statusLine={kiteEnded ? (<><i />Kite ended at 6:00 AM</>) : undefined}
      title=""
      view="watchers"
      watchers={screen}
    />
  );
}
