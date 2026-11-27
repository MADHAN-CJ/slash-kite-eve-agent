'use client';

import { useEffect, useRef } from 'react';
import { HOME_MARKUP } from '@/lib/v2/home/markup';
import { mountHero } from '@/lib/v2/home/hero';
import { mountSections } from '@/lib/v2/home/sections';
import { mountSignup } from '@/lib/v2/home/signup';
import { homepageAuth } from '@/lib/v2/home/auth';
import { isLoggedIn } from '@/lib/client/settings';
import { homeScope } from '@/lib/v2/home/scope';

export function HomeLab({
  flow,
  state,
  live = false,
}: {
  readonly flow: 'homepage' | 'signup';
  readonly state: string;
  readonly live?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = host.current;
    if (!root) return;
    const target = new URLSearchParams(window.location.search).get('returnTo');
    const returnTo = live && target && /^\/chat(?:\?|$)/.test(target) ? target : null;
    const signedIn = live && isLoggedIn();
    if (signedIn && returnTo) {
      window.location.replace(returnTo);
      return;
    }
    const html = document.documentElement;
    const scope = homeScope();
    html.classList.add('home-v2');
    html.dataset.state = state;
    root.innerHTML = HOME_MARKUP;
    root
      .querySelector('#banner button')
      ?.addEventListener('click', () => root.querySelector('#banner')?.classList.add('gone'));
    if (live) {
      root.querySelector('#banner')?.remove();
      root
        .querySelector('#pg')
        ?.insertAdjacentHTML(
          'beforebegin',
          '<p class="sample-label">Illustrative data · order book, charts and sample answers</p>',
        );
      const product = root.querySelector<HTMLAnchorElement>('nav .links a');
      if (product) product.href = '#secs';
      const connector = root.querySelector<HTMLAnchorElement>('[data-act="ai"]');
      if (connector) {
        connector.removeAttribute('data-act');
        connector.href = 'https://mcp.slash.markets';
      }
    }
    const hero = mountHero(root, scope);
    const stopSections = mountSections(root, scope);
    let queued = '';
    const exit = (to: string, next: string) => {
      if (live) {
        if (queued && (next === 'draft' || to === 'tour')) {
          try {
            sessionStorage.setItem('slash-home:queued-question', queued);
          } catch {}
        }
        window.location.assign(returnTo ?? '/chat');
        return;
      }
      const params = new URLSearchParams({ s: next });
      if (queued && (next === 'draft' || to === 'tour')) {
        try {
          sessionStorage.setItem('slash-home-lab:queued-question', queued);
        } catch {}
      }
      window.location.assign(`/lab/${to}?${params}`);
    };
    const stopSignup = mountSignup(
      root,
      scope,
      hero,
      {
        flow,
        state: (next: string) => {
          html.dataset.state = next;
        },
        event: (name: string) => {
          html.dataset.uxEvent = name;
        },
        queuedQuestion: (question: string) => {
          queued = question;
        },
        exit,
      },
      state,
      live ? homepageAuth(signedIn, Boolean(returnTo)) : null,
    );
    const onExit = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const link = event.target.closest<HTMLElement>('[data-exit]');
      if (!link?.dataset.exit) return;
      const [to, next] = link.dataset.exit.split(':');
      event.preventDefault();
      exit(to, next);
    };
    root.addEventListener('click', onExit);
    return () => {
      root.removeEventListener('click', onExit);
      stopSignup();
      stopSections();
      scope.dispose();
      root.replaceChildren();
      html.style.zoom = '';
      html.classList.remove('home-v2', 'lt1100', 'lt980', 'lt820');
      delete html.dataset.state;
      delete html.dataset.uxEvent;
    };
  }, [flow, state, live]);
  return <div ref={host} />;
}
