'use client';

import { useEffect, useState } from 'react';
import {
  ArrowRightLeftIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  RadarIcon,
  SquarePenIcon,
  Trash2Icon,
} from 'lucide-react';
import { Logomark, Wordmark } from '@/components/brand';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ThreadSummary } from '@/lib/client/threads-api';
import { EditableTitle } from './editable-title';
import { SiteFooter } from './site-footer';

const RAIL_COLLAPSED_KEY = 'slash-kite:sidebar-collapsed';

export type SidebarSection = 'chat' | 'watchers' | 'trade';

/** Navigation rail: "New chat", the Watchers and Trade panes, then the chat history, newest first. */
export function Sidebar({
  threads,
  activeId,
  section,
  onNewChat,
  onOpenWatchers,
  onOpenTrade,
  onSelect,
  onDelete,
  onRename,
}: {
  readonly threads: ThreadSummary[];
  readonly activeId: string;
  readonly section: SidebarSection;
  readonly onNewChat: () => void;
  readonly onOpenWatchers: () => void;
  readonly onOpenTrade: () => void;
  readonly onSelect: (id: string) => void;
  readonly onDelete: (id: string) => void;
  readonly onRename: (id: string, title: string) => void | Promise<void>;
}) {
  const [railCollapsed, setRailCollapsed] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(RAIL_COLLAPSED_KEY) === '1') setRailCollapsed(true);
    } catch {
      // storage unavailable — start expanded
    }
  }, []);

  const toggleRail = () =>
    setRailCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(RAIL_COLLAPSED_KEY, next ? '1' : '0');
      } catch {
        // storage unavailable — state still toggles for this session
      }
      return next;
    });

  return (
    <aside
      className={cn(
        'relative h-full shrink-0 overflow-hidden border-r bg-sidebar text-sidebar-foreground',
        'transition-[width] duration-300 ease-in-out motion-reduce:transition-none',
        railCollapsed ? 'w-14' : 'w-64',
      )}
    >
      <div
        className={cn(
          'absolute inset-y-0 left-0 flex w-14 flex-col items-center transition-opacity duration-200 motion-reduce:transition-none',
          railCollapsed ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        inert={!railCollapsed}
      >
        <Logomark className="mt-4 h-6" />
        <button
          aria-label="Expand sidebar"
          className="mt-3 rounded-md p-1.5 text-muted-foreground hover:bg-accent/50 hover:text-foreground"
          onClick={toggleRail}
          title="Expand sidebar"
          type="button"
        >
          <PanelLeftOpenIcon className="size-4" />
        </button>
        <Button aria-label="New chat" className="mt-2" onClick={onNewChat} size="icon-sm" title="New chat" variant="ghost">
          <SquarePenIcon className="size-4" />
        </Button>
        <Button
          aria-label="Watchers"
          className={cn('mt-1', section === 'watchers' && 'bg-foreground/10')}
          onClick={onOpenWatchers}
          size="icon-sm"
          title="Watchers"
          variant="ghost"
        >
          <RadarIcon className="size-4" />
        </Button>
        <Button
          aria-label="Trade on Kite"
          className={cn('mt-1', section === 'trade' && 'bg-foreground/10')}
          onClick={onOpenTrade}
          size="icon-sm"
          title="Trade on Kite"
          variant="ghost"
        >
          <ArrowRightLeftIcon className="size-4" />
        </Button>
      </div>

      <div
        className={cn(
          'absolute inset-y-0 left-0 flex w-64 flex-col transition-opacity duration-200 motion-reduce:transition-none',
          railCollapsed ? 'pointer-events-none opacity-0' : 'opacity-100',
        )}
        inert={railCollapsed}
      >
        <div className="flex items-center gap-2.5 px-4 pt-4 pb-2">
          <Logomark className="h-6" />
          <span className="flex-1 font-semibold">
            <Wordmark />
          </span>
          <button
            aria-label="Collapse sidebar"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            onClick={toggleRail}
            title="Collapse sidebar"
            type="button"
          >
            <PanelLeftCloseIcon className="size-4" />
          </button>
        </div>

        <div className="px-3 pt-2">
          <Button className="w-full justify-start" onClick={onNewChat} size="sm" variant="secondary">
            <SquarePenIcon className="size-4" /> New chat
          </Button>
          <Button
            aria-current={section === 'watchers' ? 'page' : undefined}
            className={cn('mt-2 w-full justify-start', section === 'watchers' && 'bg-foreground/10')}
            data-testid="nav-watchers"
            onClick={onOpenWatchers}
            size="sm"
            variant="ghost"
          >
            <RadarIcon className="size-4" /> Watchers
          </Button>
          <Button
            aria-current={section === 'trade' ? 'page' : undefined}
            className={cn('w-full justify-start', section === 'trade' && 'bg-foreground/10')}
            data-testid="nav-trade"
            onClick={onOpenTrade}
            size="sm"
            variant="ghost"
          >
            <ArrowRightLeftIcon className="size-4" /> Trade on Kite
          </Button>
        </div>

        <p className="px-4 pt-5 pb-1 font-medium text-muted-foreground text-xs tracking-wider">CHATS</p>

        <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
          {threads.length === 0 ? (
            <p className="px-2 pt-2 text-muted-foreground text-sm">No chats yet.</p>
          ) : (
            threads.map((t) => {
              const active = t.id === activeId;
              return (
                <div
                  className={cn(
                    'group flex items-center gap-1 rounded-md pl-2',
                    active ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50',
                  )}
                  key={t.id}
                >
                  {/* div, not button: EditableTitle nests its own rename button */}
                  <div
                    className="min-w-0 flex-1 cursor-pointer py-1.5 text-left text-sm"
                    onClick={() => onSelect(t.id)}
                    onKeyDown={(e) => e.key === 'Enter' && onSelect(t.id)}
                    role="button"
                    tabIndex={0}
                  >
                    <EditableTitle onSave={(title) => onRename(t.id, title)} placeholder="New chat" value={t.title} />
                  </div>
                  <button
                    aria-label="Delete chat"
                    className="mr-1 hidden shrink-0 rounded p-1 text-muted-foreground hover:text-destructive group-hover:block"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(t.id);
                    }}
                    title="Delete chat"
                    type="button"
                  >
                    <Trash2Icon className="size-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </nav>

        <div className="border-t px-4 py-3">
          <SiteFooter compact />
        </div>
      </div>
    </aside>
  );
}
