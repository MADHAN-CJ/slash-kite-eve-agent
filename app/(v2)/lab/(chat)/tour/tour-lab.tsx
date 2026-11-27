'use client';

import { useEffect, useState } from 'react';
import { ChatShell } from '@/components/v2/chat/chat-shell';
import { toast } from '@/components/v2/chat/toast';
import { TourHelp } from '@/components/v2/tour/tour-help';
import { useTourLaunch } from '@/components/v2/tour/use-tour-launch';
import { Tour } from '@/components/v2/tour/tour';
import { TourQuestion } from '@/components/v2/tour/tour-demo';
import { TOUR_EXAMPLE, tourStarters, type TourMarket } from '@/lib/v2/tour';

export function TourLab({ state }: { readonly state: 'new' | 'q' | 'after' | 'queued' }) {
  const [question, setQuestion] = useState(state === 'q' || state === 'queued' ? TOUR_EXAMPLE : '');
  const [ready, setReady] = useState(false);
  // Like the prototype (`UX.queuedQuestion().prompt || EXAMPLE`): the homepage lab's queued question, else the sample.
  useEffect(() => {
    if (state === 'q' || state === 'queued') {
      try {
        const queued = sessionStorage.getItem('slash-home-lab:queued-question');
        sessionStorage.removeItem('slash-home-lab:queued-question');
        if (queued) setQuestion(queued);
      } catch {}
    }
    setReady(true);
  }, [state]);
  const [markets, setMarkets] = useState<TourMarket[]>([]);
  const { show, setShow, launch, pulse, pulseGate, finish: launchChat } = useTourLaunch(state === 'new' || state === 'q');

  useEffect(() => {
    document.documentElement.dataset.state = show && !launch ? (question ? 'q' : 'new') : (question ? 'queued' : 'after');
  }, [show, launch, question]);

  const connect = () => {
    try {
      if (question) sessionStorage.setItem('slash-tour-lab:question', question);
      else sessionStorage.removeItem('slash-tour-lab:question');
    } catch {}
    window.location.assign('/lab/connect-kite?s=connect');
  };

  const queue = (text?: string) => {
    if (text) {
      setQuestion(text);
      toast('Saved. It runs once Kite connects.', 3600);
    }
    pulseGate();
  };

  const finish = (picks: TourMarket[], shouldConnect: boolean) => {
    setMarkets(picks);
    if (shouldConnect) {
      connect();
      return;
    }
    if (question) window.history.replaceState(null, '', '?s=queued');
    launchChat(true);
  };

  if (!ready) return null;
  return <>
    <div className={launch ? 'tour-launch' : undefined} inert={show && !launch}>
      <ChatShell
        auth="delayed"
        busy={false}
        composerGate="readonly"
        composerPlaceholder="Connect Kite to start asking"
        creditsLeft={64}
        currentId={null}
        empty
        gate={{ text: 'Connect Kite to start asking. Read-only.', action: 'Connect Kite', onAction: connect }}
        gatePulseKey={pulse}
        gateQuestion={question ? <TourQuestion question={question} label="saved for later" /> : undefined}
        onAccount={() => {}}
        onAsk={() => {}}
        onConnectKite={connect}
        onDeleteChat={() => {}}
        onGateTap={queue}
        onNewChat={() => {}}
        onOpenChat={() => {}}
        onStop={() => {}}
        onWatchers={() => {}}
        sessions={[]}
        starters={tourStarters(markets)}
        title=""
        waitingQuestion={question}
      />
      <TourHelp onReplay={() => setShow(true)} />
    </div>
    {show && <div className={launch ? 'tour-exit' : undefined} inert={launch}><Tour question={question} initialMarkets={markets} onFinish={finish} /></div>}
  </>;
}
