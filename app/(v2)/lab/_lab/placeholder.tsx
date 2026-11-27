import type { Flow, FlowState } from '@/lib/v2/lab';

/** What a lab state shows until its phase builds it. Links are full page loads: each shell brings its own stylesheet. */
export function Placeholder({ flow, state }: { readonly flow: Flow; readonly state: FlowState }) {
  return (
    <main className="lab" data-flow={flow.id} data-state={state.id}>
      <div className="wrap">
        <p className="lbl">
          <a href="/lab">lab</a> · {flow.id} · {state.id}
        </p>
        <h1>{state.label}</h1>
        <p className="sub">{state.note || flow.summary}</p>
        <div className="card">
          <p className="lbl">Not built yet</p>
          <p>
            This state belongs to the <span className="mono">{flow.shell}</span> shell. Exits:{' '}
            <span className="mono">{flow.exits.map((x) => `${x.to}:${x.state}`).join(' · ') || 'none'}</span>. Events:{' '}
            <span className="mono">{flow.events.map((e) => e.name).join(' · ') || 'none'}</span>.
          </p>
        </div>
      </div>
    </main>
  );
}
