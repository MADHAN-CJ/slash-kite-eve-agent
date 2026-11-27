'use client';

import { useEffect, useRef } from 'react';
import { CandlestickSeries, ColorType, createChart, CrosshairMode, HistogramSeries, type UTCTimestamp } from 'lightweight-charts';
import { toEpochSeconds, type ChartSpec } from '@/components/charts/chart-line';

/**
 * The Chart tab: the candles a script printed as its `@@chart` line, drawn
 * in the v2 palette (PRINCIPLES.md: up #00A83C / down #EF5350 fills, mono
 * axis text, no decoration). Option chains fall back to a plain table of
 * strikes until the chain chart is restyled.
 */

const IST_OFFSET_S = 5.5 * 3600;

export function ChartPane({ spec }: { readonly spec: ChartSpec }) {
  if (spec.type === 'candles') return <Candles spec={spec} />;
  return (
    <div className="tw">
      <table>
        <thead>
          <tr>
            <th>Strike</th>
            <th>CE last</th>
            <th>CE OI</th>
            <th>PE last</th>
            <th>PE OI</th>
          </tr>
        </thead>
        <tbody>
          {spec.strikes.map((s) => (
            <tr key={s.strike}>
              <td>{s.strike.toLocaleString('en-IN')}</td>
              <td className="num">{s.ce?.last_price?.toLocaleString('en-IN') ?? '—'}</td>
              <td className="num">{s.ce?.oi?.toLocaleString('en-IN') ?? '—'}</td>
              <td className="num">{s.pe?.last_price?.toLocaleString('en-IN') ?? '—'}</td>
              <td className="num">{s.pe?.oi?.toLocaleString('en-IN') ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Candles({ spec }: { readonly spec: Extract<ChartSpec, { type: 'candles' }> }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const chart = createChart(el, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#7d8591', fontSize: 10.5, fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace', attributionLogo: false },
      grid: { vertLines: { visible: false }, horzLines: { color: 'rgba(255,255,255,.06)', style: 1 } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, timeVisible: spec.interval !== undefined, secondsVisible: false },
      handleScroll: { vertTouchDrag: false },
    });
    const candles = chart.addSeries(CandlestickSeries, {
      upColor: '#00A83C',
      downColor: '#EF5350',
      borderUpColor: '#00A83C',
      borderDownColor: '#EF5350',
      wickUpColor: '#3fcf72',
      wickDownColor: '#ff7a77',
      priceFormat: { type: 'price', precision: 2, minMove: 0.05 },
      lastValueVisible: false,
    });
    candles.priceScale().applyOptions({ scaleMargins: { top: 0.08, bottom: 0.25 } });
    const volume = chart.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: 'volume', priceLineVisible: false, lastValueVisible: false });
    chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.78, bottom: 0 } });
    const rows = spec.rows
      .map((r) => ({ ...r, t: toEpochSeconds(r.time) }))
      .filter((r): r is typeof r & { t: number } => r.t !== null)
      .sort((a, b) => a.t - b.t);
    candles.setData(rows.map((r) => ({ time: (r.t + IST_OFFSET_S) as UTCTimestamp, open: r.open, high: r.high, low: r.low, close: r.close })));
    volume.setData(rows.map((r) => ({ time: (r.t + IST_OFFSET_S) as UTCTimestamp, value: r.volume ?? 0, color: r.close >= r.open ? 'rgba(0,168,60,.35)' : 'rgba(239,83,80,.35)' })));
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [spec]);
  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 6, background: 'var(--surface)', padding: '8px 4px 4px' }}>
      {spec.title ? <div style={{ padding: '0 8px 4px', font: '400 10.5px var(--mono)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--mute)' }}>{spec.title}</div> : null}
      <div ref={host} style={{ height: 230 }} />
    </div>
  );
}
