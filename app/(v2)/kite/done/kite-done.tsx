'use client';

import { useEffect, useState } from 'react';
import { KITE_LOGIN_CHANNEL, type KiteLoginMessage } from '@/lib/v2/kite-login';

export function KiteDone() {
  const [note, setNote] = useState('Finishing the Zerodha login…');
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const msg: KiteLoginMessage = params.get('kite') === 'connected' ? { outcome: 'connected' } : { outcome: 'error', reason: params.get('reason') ?? 'Zerodha login failed.' };
    try {
      const ch = new BroadcastChannel(KITE_LOGIN_CHANNEL);
      ch.postMessage(msg);
      ch.close();
    } catch {
      // no BroadcastChannel: the opener polls the connection status instead
    }
    if (window.opener) {
      setNote(msg.outcome === 'connected' ? 'Kite connected. You can close this window.' : msg.reason);
      window.close();
      return;
    }
    const to = new URL('/chat', window.location.origin);
    to.searchParams.set('kite', msg.outcome === 'connected' ? 'connected' : 'error');
    if (msg.outcome === 'error') to.searchParams.set('reason', msg.reason);
    window.location.replace(to.toString());
  }, []);
  return (
    <main style={{ minHeight: '100svh', display: 'grid', placeItems: 'center', background: 'var(--bg)', color: 'var(--body)', font: '15px/1.5 TS,-apple-system,system-ui,sans-serif' }}>
      <p>{note}</p>
    </main>
  );
}
