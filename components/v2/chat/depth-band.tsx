'use client';

import { useEffect, useRef } from 'react';

/**
 * "The data is the decoration": the order-book band under the empty chat
 * (markets-hero ux/shared/chat/app.js, last block). Sizes are made up, as in
 * the prototype — a seeded book whose levels change size every 1.8 s while the
 * empty screen is showing. With reduced motion it is one still frame.
 */

const LEVELS = 40;
const TICK_MS = 1800;

function seeded(seed: string): () => number {
  let x = [...seed].reduce((a, c) => a + c.charCodeAt(0) * 31, 7) % 2147483647 || 7;
  return () => (x = (x * 16807) % 2147483647) / 2147483647;
}

function side(q: number[], dir: 1 | -1, W: number, H: number, stroke: string, fill: string): string {
  let cum = 0;
  const tot = q.reduce((a, b) => a + b, 0);
  const half = W / 2;
  const gap = Math.min(W * 0.06, 60);
  const step = (half - gap) / LEVELS;
  let d = `M${half + dir * gap} ${H}`;
  q.forEach((v, i) => {
    cum += v;
    const y = H - (cum / tot) * H * 0.86;
    const x0 = half + dir * (gap + step * i);
    const x1 = half + dir * (gap + step * (i + 1));
    d += ` L${x0} ${y} L${x1} ${y}`;
  });
  return `<path d="${d} L${half + dir * half} ${H} Z" fill="url(#${fill})" stroke="${stroke}" stroke-width="1.2"/>`;
}

export function DepthBand({ active }: { readonly active: boolean }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const activeRef = useRef(active);
  activeRef.current = active;
  const drawRef = useRef<() => void>(() => {});

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const r = seeded('nifty-fut');
    const bq: number[] = [];
    const aq: number[] = [];
    for (let i = 0; i < LEVELS; i++) {
      bq.push(0.4 + r() * 1.2 + (r() < 0.1 ? 3 : 0));
      aq.push(0.4 + r() * 1.2 + (r() < 0.1 ? 3 : 0));
    }
    const draw = () => {
      const W = svg.clientWidth;
      const H = svg.clientHeight;
      if (!W || !H) return;
      const tb = bq.reduce((a, b) => a + b, 0) * 0.31;
      const ta = aq.reduce((a, b) => a + b, 0) * 0.31;
      const mono = 'ui-monospace,Menlo,monospace';
      svg.innerHTML =
        '<defs><linearGradient id="dgb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgba(0,168,60,.22)"/><stop offset="1" stop-color="rgba(0,168,60,0)"/></linearGradient><linearGradient id="dga" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgba(239,83,80,.2)"/><stop offset="1" stop-color="rgba(239,83,80,0)"/></linearGradient></defs>' +
        side(bq, -1, W, H, 'rgba(63,207,114,.7)', 'dgb') +
        side(aq, 1, W, H, 'rgba(255,122,119,.7)', 'dga') +
        `<text x="20" y="${H - 12}" fill="currentColor" opacity=".35" font-size="10.5" font-family="${mono}">BIDS ${tb.toFixed(2)}L</text>` +
        `<text x="${W - 20}" y="${H - 12}" text-anchor="end" fill="currentColor" opacity=".35" font-size="10.5" font-family="${mono}">ASKS ${ta.toFixed(2)}L</text>`;
    };
    drawRef.current = draw;
    const tick = () => {
      if (!activeRef.current || document.hidden) return;
      for (let k = 0; k < 3; k++) {
        const q = Math.random() < 0.5 ? bq : aq;
        const i = Math.floor(Math.random() * LEVELS);
        q[i] = Math.max(0.2, (q[i] ?? 1) * (0.75 + Math.random() * 0.5));
      }
      draw();
    };
    svg.style.color = 'var(--ink)';
    draw();
    window.addEventListener('resize', draw);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = reduced ? 0 : window.setInterval(tick, TICK_MS);
    return () => {
      window.removeEventListener('resize', draw);
      if (timer) window.clearInterval(timer);
    };
  }, []);

  // The band is laid out only on the empty screen; redraw when it comes back.
  useEffect(() => {
    drawRef.current();
  }, [active]);

  return (
    <div aria-hidden="true" className="depth">
      <svg id="depth" ref={svgRef} />
      <span className="brk l">[ NIFTY FUT · BIDS ]</span>
      <span className="brk r">[ ASKS ]</span>
    </div>
  );
}
