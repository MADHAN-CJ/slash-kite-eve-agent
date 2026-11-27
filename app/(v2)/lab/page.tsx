import { assertLab, FLOWS, parityOf, SOURCE_COMMIT } from '@/lib/v2/lab';
import './lab.css';

export const metadata = { title: 'v2 lab · /markets' };

const PROTOTYPE = process.env.MARKETS_HERO_URL ?? 'http://localhost:8770/ux';

// Rendered per request so the production gate (V2_LAB) is read at runtime.
export const dynamic = 'force-dynamic';

/** Links are plain anchors: each shell brings its own stylesheet, so moving between lab pages is a full load. */
/** Directory of every markets-hero state with its parity status and a link to the prototype. */
export default function LabIndex() {
  assertLab();
  const total = FLOWS.reduce((n, f) => n + f.states.length, 0);
  const built = FLOWS.reduce((n, f) => n + f.states.filter((s) => parityOf(f.id, s.id) !== 'todo').length, 0);
  return (
    <main className="lab">
      <div className="wrap">
        <p className="lbl">v2 state lab · markets-hero @ {SOURCE_COMMIT}</p>
        <h1>Every state, one click away</h1>
        <p className="sub">
          {built} of {total} states built. <a href="/lab/tokens">Tokens and voices</a>
        </p>
        {FLOWS.map((f) => (
          <section key={f.id}>
            <h2>
              {f.title} <span className="lbl">{f.id} · {f.shell} shell · {f.group}</span>
            </h2>
            <table>
              <thead>
                <tr>
                  <th>State</th>
                  <th>What shows</th>
                  <th>Status</th>
                  <th>Prototype</th>
                </tr>
              </thead>
              <tbody>
                {f.states.map((s) => {
                  const st = parityOf(f.id, s.id);
                  return (
                    <tr key={s.id}>
                      <td>
                        <a href={`/lab/${f.id}?s=${s.id}`}>
                          <code>{s.id}</code>
                        </a>
                        <br />
                        {s.label}
                      </td>
                      <td>{s.note}</td>
                      <td>
                        <span className={`st ${st}`}>{st}</span>
                      </td>
                      <td>
                        <a href={`${PROTOTYPE}/flows/${f.id}/?s=${s.id}&chrome=0`} rel="noreferrer" target="_blank">
                          open
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        ))}
      </div>
    </main>
  );
}
