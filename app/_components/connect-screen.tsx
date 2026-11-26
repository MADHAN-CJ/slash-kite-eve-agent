'use client';

import { Loader2Icon, LogInIcon } from 'lucide-react';
import { Wordmark } from '@/components/brand';
import { Button } from '@/components/ui/button';
import { type BrokerStatus, describeStatus } from '@/lib/client/broker';

/**
 * The gate between login and chat (plan D18): shown whenever the user's
 * Zerodha connection is not `active`. One primary action — Login with Kite —
 * and a secondary way through for people who only want market data and web
 * research without their own account.
 */
export function ConnectScreen({
  status,
  busy,
  notice,
  onLogin,
  onSkip,
}: {
  readonly status: BrokerStatus;
  readonly busy: boolean;
  readonly notice: string | null;
  readonly onLogin: () => void;
  readonly onSkip: () => void;
}) {
  const expired = status.status === 'token_expired';
  return (
    <div className="flex flex-1 items-center justify-center px-4" data-testid="connect-screen">
      <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Wordmark /> for Zerodha
        </div>
        <h1 className="font-serif text-2xl leading-tight">
          {expired ? 'Log in to Zerodha again' : 'Connect your Zerodha account'}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground" data-testid="connect-status">
          {describeStatus(status)}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          The analyst reads your holdings, positions and funds through Kite Connect. Access is
          read-only: no orders are ever placed from here.
        </p>
        {notice ? (
          <p className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
            {notice}
          </p>
        ) : null}
        <div className="mt-5 flex flex-col gap-2">
          <Button data-testid="kite-login" disabled={busy} onClick={onLogin} size="lg">
            {busy ? <Loader2Icon className="size-4 animate-spin" /> : <LogInIcon className="size-4" />}
            Login with Kite
          </Button>
          <Button data-testid="connect-skip" onClick={onSkip} size="sm" variant="ghost">
            Continue without Zerodha for now
          </Button>
        </div>
      </div>
    </div>
  );
}
