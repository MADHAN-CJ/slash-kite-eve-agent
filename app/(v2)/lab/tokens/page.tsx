import { assertLab } from '@/lib/v2/lab';
import '../lab.css';

export const metadata = { title: 'v2 tokens · /markets' };

const COLOURS: readonly (readonly [string, string, string])[] = [
  ['--bg', '#0F1114', 'the page'],
  ['--panel', 'bg + 5% white', 'cards'],
  ['--raised', 'bg + 9% white', 'controls'],
  ['--raised2', 'bg + 14% white', 'segmented track'],
  ['--ink', '#F5F7FA', 'headings, values'],
  ['--body', '#A9B1BD', 'reading text'],
  ['--muted', '#7d8591', 'labels'],
  ['--slash', '#3D6BFF', 'the brand blue'],
  ['--go', '#2f5cf0', 'run button, pulse'],
  ['--mint', '#7EE2A8', 'watching, connected, done'],
  ['--sky', '#8CB8FF', 'the system talking'],
  ['--peach', '#F2C38B', 'your level'],
  ['--lav', '#C7A6FF', 'code keywords only'],
  ['--claude', '#D97757', "Claude's mark only"],
  ['--up', '#00A83C', 'price up, fill'],
  ['--down', '#EF5350', 'price down, fill'],
  ['--upt', '#3fcf72', 'price up, text'],
  ['--downt', '#ff7a77', 'price down, text'],
];

// Rendered per request so the production gate (V2_LAB) is read at runtime.
export const dynamic = 'force-dynamic';

/** The shared tokens rendered, to check fonts and colours against markets-hero principles.html. */
export default function LabTokens() {
  assertLab();
  return (
    <main className="lab">
      <div className="wrap">
        <p className="lbl">
          <a href="/lab">lab</a> · tokens
        </p>
        <h1>Tokens and voices</h1>
        <p className="sub">Dark, flat, one blue. Each colour has one job.</p>

        <h2>Colour</h2>
        <div className="grid">
          {COLOURS.map(([name, value, job]) => (
            <div className="sw" key={name}>
              <i style={{ background: `var(${name})` }} />
              <div>
                <b>{name}</b>
                <span>
                  {value} · {job}
                </span>
              </div>
            </div>
          ))}
        </div>

        <h2>Three voices</h2>
        <div className="card">
          <p className="lbl">Serif · Source Serif 4, 500 · one headline per page</p>
          <p className="serif" data-testid="voice-serif">
            Search the market like the web
          </p>
          <p className="lbl">Sans · Timeless Sans · everything a person reads</p>
          <p data-testid="voice-sans">Ask about any stock, level or indicator. Your agent does the analysis.</p>
          <p className="lbl">Mono · everything a machine says</p>
          <p className="mono" data-testid="voice-mono">
            961 candles read · 140 tokens sent · As of 14:32:05
          </p>
        </div>

        <h2>Buttons</h2>
        <div className="card row">
          <button className="b pri" type="button">
            Sign up free
          </button>
          <button className="b gh" type="button">
            Sign in
          </button>
          <button className="b ln" type="button">
            Not now
          </button>
          <button aria-label="Run" className="run" type="button">
            ↑
          </button>
        </div>
      </div>
    </main>
  );
}
