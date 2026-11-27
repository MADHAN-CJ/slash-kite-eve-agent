import type { ReactNode } from 'react';
import '@/styles/v2/chat.css';
import '@/styles/v2/run.css';
import '@/styles/v2/kite.css';
import '@/styles/v2/watchers.css';
import '@/styles/v2/trade.css';
import '@/styles/v2/account.css';
import '@/styles/v2/tour.css';

/** The chat shell's two stylesheets, as the prototype's flow pages load them. */
export default function ChatLayout({ children }: { readonly children: ReactNode }) {
  return children;
}
