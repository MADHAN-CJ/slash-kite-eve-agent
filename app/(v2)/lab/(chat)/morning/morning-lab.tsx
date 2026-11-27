'use client';

import { useEffect, useState } from 'react';
import { AnswerMessage, UserMessage } from '@/components/v2/chat/answer';
import { ChatShell, type ShellSession } from '@/components/v2/chat/chat-shell';
import { buildAnswer } from '@/lib/v2/answer-model';

/**
 * The `morning` flow from fixtures: yesterday's GOLDBEES chat at 06:12, after
 * Kite ended the session. Kite's window is a plain stand-in here (as in the
 * prototype); the real app opens Zerodha in a pop-up from the dialog.
 */

const PAUSED = 5;
const HOUR = 36e5;
type St = 'ended' | 'kite' | 'failed' | 'back';

function seed(now: number): ShellSession[] {
  return [
    { id: 'o0', title: 'GOLDBEES levels this week', updatedAt: new Date(now - 15 * HOUR).toISOString() },
    { id: 'o1', title: 'Nifty levels for Thursday expiry', updatedAt: new Date(now - HOUR).toISOString() },
    { id: 'o2', title: 'Crude oil range this week', updatedAt: new Date(now - 24 * HOUR).toISOString() },
    { id: 'o3', title: 'Bank Nifty RSI on 15 min', updatedAt: new Date(now - 48 * HOUR).toISOString() },
  ];
}

const ANSWER = buildAnswer({ text: 'GOLDBEES is at **99.82**, just under 100. It went below at **14:05** and has not closed back above since.', tools: [], streaming: false });

export function MorningLab({ state }: { readonly state: string }) {
  const [st, setSt] = useState<St>('ended');
  const [sessions, setSessions] = useState<ShellSession[]>([]);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setSessions(seed(Date.now()));
    document.documentElement.dataset.state = state;
    setReady(true);
    const t = window.setTimeout(() => setSt(state as St), 200);
    return () => window.clearTimeout(t);
  }, [state]);
  useEffect(() => {
    document.documentElement.dataset.state = st;
  }, [st]);

  useEffect(() => {
    if (st !== 'kite') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSt('failed');
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [st]);

  if (!ready) return null;
  const on = st === 'back';
  const gate =
    st === 'ended'
      ? { text: 'Kite session ended at 6:00. Reconnect to ask.', action: 'Reconnect Kite', onAction: () => setSt('kite') }
      : st === 'failed'
        ? { text: 'Kite login didn’t finish. Nothing changed.', action: 'Try again', onAction: () => setSt('kite') }
        : st === 'kite'
          ? { text: 'Finish logging in on Kite’s page.', action: '', onAction: () => {}, busy: { onCancel: () => setSt('failed') } }
          : undefined;

  return (
    <>
      <ChatShell
        auth={on ? 'kite' : 'ended'}
        busy={false}
        composerGate={on ? undefined : 'off'}
        composerPlaceholder={on ? undefined : 'Reconnect Kite to ask'}
        creditsLeft={64}
        currentId="o0"
        empty={false}
        gate={gate}
        kiteUntil={null}
        onAccount={() => {}}
        onAsk={() => {}}
        onConnectKite={() => setSt('kite')}
        onDeleteChat={(id) => setSessions((prev) => prev.filter((s) => s.id !== id))}
        onGateTap={() => setSt('kite')}
        onNewChat={() => {}}
        onOpenChat={() => {}}
        onStop={() => {}}
        onWatchers={() => {}}
        pausedWatchers={on ? 0 : PAUSED}
        sessions={sessions}
        statusLine={on ? (<><i />Kite · 23h 46m left</>) : (<><i />Kite ended at 6:00 AM</>)}
        title="GOLDBEES levels this week"
      >
        <UserMessage index={0} text="Where is GOLDBEES against 100 today?" />
        <AnswerMessage index={1} model={ANSWER} />
        {on ? (
          <div className="sy9">
            <i />
            <div>
              <b>
                Kite connected at <span className="tm">06:14</span>
              </b>
              , until 6:00 AM tomorrow. Your {PAUSED} watchers are running again.{' '}
              <a href="#watchers" onClick={(e) => e.preventDefault()}>
                Open Watchers
              </a>
            </div>
          </div>
        ) : null}
      </ChatShell>
      {/* Kite's window, a plain stand-in (prototype morning/index.html) */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: Esc is handled above */}
      <div className={st === 'kite' ? 'kw9s is-on' : 'kw9s'} id="kw9s" onClick={(e) => e.target === e.currentTarget && setSt('failed')}>
        <div aria-label="Kite’s window (stand-in)" className="kw9" role="dialog">
          <div className="bar">
            {/* biome-ignore lint/a11y/useKeyWithClickEvents: decorative window chrome */}
            <i data-k="close" onClick={() => setSt('failed')} title="Close window" />
            <i />
            <i />
            <span>kite.zerodha.com/connect/login</span>
          </div>
          <div className="bd">
            <div style={{ width: '100%' }}>
              <div className="cap">Kite’s page · stand-in</div>
              <h4>Log in to Kite</h4>
              <p>User ID, password, then the code from your app. /markets never sees them.</p>
              <div className="sk">
                <i />
                <i />
                <i />
              </div>
              <div className="bt">
                <button className="p" data-k="done" onClick={() => setSt('back')} type="button">
                  Finish login
                </button>
                <button data-k="close" onClick={() => setSt('failed')} type="button">
                  Close window
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
