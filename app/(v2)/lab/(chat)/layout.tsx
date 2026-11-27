import type { ReactNode } from 'react';
import '@/styles/v2/chat.css';
import '@/styles/v2/run.css';
import '@/styles/v2/kite.css';

/** Lab screens that sit on the chat shell load its two stylesheets, as the prototype's flow pages do. */
export default function ChatLabLayout({ children }: { readonly children: ReactNode }) {
  return children;
}
