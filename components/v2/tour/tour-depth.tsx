'use client';

import { useEffect, useRef } from 'react';

const LEVELS = 46;

export function TourDepth() {
  const canvas = useRef<HTMLCanvasElement>(null);
  // Kept in a ref so React's dev-only double effect run (Strict Mode) does not draw a
  // second random book — the lab compares pixels against the prototype's seeded one.
  const book = useRef<{ bids: number[]; asks: number[] }>(null);

  useEffect(() => {
    const element = canvas.current;
    const ctx = element?.getContext('2d');
    if (!element || !ctx) return;
    const quantities = () => Array.from({ length: LEVELS }, (_, i) => 0.6 + Math.random() * 0.8 + (i % 7 === 3 ? 1.6 : 0));
    book.current ??= { bids: quantities(), asks: quantities() };
    const { bids, asks } = book.current;

    const draw = () => {
      const { clientWidth: width, clientHeight: height } = element;
      if (!width || !height) return;
      const scale = window.devicePixelRatio || 1;
      element.width = width * scale;
      element.height = height * scale;
      ctx.setTransform(scale, 0, 0, scale, 0, 0);

      const half = width / 2;
      const gap = Math.min(width * 0.05, 56);
      const step = (half - gap) / LEVELS;
      for (const [sizes, direction, color] of [[bids, 1, '0,168,60'], [asks, -1, '239,83,80']] as const) {
        const total = sizes.reduce((sum, size) => sum + size, 0);
        let x = half - direction * gap;
        let sum = 0;
        ctx.beginPath();
        ctx.moveTo(x, height);
        for (const size of sizes) {
          sum += size;
          const y = height - (sum / total) * height * 0.92;
          ctx.lineTo(x, y);
          x -= direction * step;
          ctx.lineTo(x, y);
        }
        ctx.strokeStyle = `rgba(${color},.55)`;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.lineTo(x, height);
        ctx.closePath();
        const gradient = ctx.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0, `rgba(${color},.22)`);
        gradient.addColorStop(1, `rgba(${color},0)`);
        ctx.fillStyle = gradient;
        ctx.fill();
      }
    };

    draw();
    window.addEventListener('resize', draw);
    const timer = matchMedia('(prefers-reduced-motion: reduce)').matches ? undefined : window.setInterval(() => {
      if (document.hidden) return;
      for (let k = 0; k < 3; k++) {
        const sizes = Math.random() < 0.5 ? bids : asks;
        const index = Math.floor(Math.random() * LEVELS);
        sizes[index] = Math.max(0.3, sizes[index] * (0.75 + Math.random() * 0.5));
      }
      draw();
    }, 900);
    return () => {
      window.removeEventListener('resize', draw);
      window.clearInterval(timer);
    };
  }, []);

  return <>
    <canvas aria-hidden="true" className="dp" id="obdp" ref={canvas} />
    <span aria-hidden="true" className="brk2 l">[ NIFTY FUT · BIDS ]</span>
    <span aria-hidden="true" className="brk2 r">[ ASKS ]</span>
  </>;
}
