import type { Metadata } from 'next';
import { ChatApp } from '@/components/v2/chat/chat-app';

export const metadata: Metadata = { title: 'Chat · /markets' };

export default function ChatPage() {
  return <ChatApp />;
}
