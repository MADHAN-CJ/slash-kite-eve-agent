import sharp from 'sharp';

export interface Sample { at: string; value: string | null }
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Plots only recorded check values. No synthetic candles, inferred levels or prices. */
export async function watcherChart(samples: Sample[], label: string): Promise<Buffer> {
  const points = samples.flatMap(s => {
    const n = s.value === null || !s.value.trim() ? NaN : Number(s.value);
    return Number.isFinite(n) ? [{ at: s.at, value: n }] : [];
  }).slice(-48);
  const low = Math.min(...points.map(p => p.value));
  const high = Math.max(...points.map(p => p.value));
  const range = high - low || Math.max(Math.abs(high) * 0.01, 1);
  const xy = points.map((p, i) => ({ x: 30 + (points.length === 1 ? 237 : i * 474 / (points.length - 1)), y: 155 - (p.value - low) / range * 100 }));
  const path = xy.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const last = xy.at(-1);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="534" height="210" viewBox="0 0 534 210">
    <rect width="534" height="210" rx="6" fill="#0F1114"/>
    <text x="20" y="25" fill="#A9B1BD" font-family="sans-serif" font-size="12">${esc(label.slice(0, 65))}</text>
    <path d="M30,65H504M30,110H504M30,155H504" stroke="#262A31" fill="none"/>
    ${last ? `<path d="${path}" stroke="#8CB8FF" stroke-width="2" fill="none"/><circle cx="${last.x}" cy="${last.y}" r="4" fill="#8CB8FF"/>` : '<text x="30" y="110" fill="#7D8591" font-family="sans-serif" font-size="13">No numeric check values recorded</text>'}
    <text x="20" y="192" fill="#7D8591" font-family="monospace" font-size="10">${points.length} recorded check${points.length === 1 ? '' : 's'}${points.length ? ` · latest ${esc(String(points.at(-1)!.value))}` : ''}</text>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}
