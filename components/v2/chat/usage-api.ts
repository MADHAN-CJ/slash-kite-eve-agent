import { handle } from '@/lib/client/broker';
import { authHeaders } from '@/lib/client/settings';

/** This month's credits (plan D6): what the user's turns cost against the monthly allowance. */
export interface Usage {
  monthUsd: number;
  allowanceUsd: number;
  leftPct: number;
  /** ISO date the allowance renews. */
  resetsOn: string;
}

export const fetchUsage = async (): Promise<Usage> => handle<Usage>(await fetch('/api/usage', { headers: authHeaders(), cache: 'no-store' }));
