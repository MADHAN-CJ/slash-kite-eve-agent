'use client';
import { useEffect, useState } from 'react';
import { authHeaders } from '@/lib/client/settings';

interface Preferences { watchers: boolean; growth: boolean }
interface Mail { id: string; subject: string; sentAt: string; html: string; text: string }
export function EmailPreferences() {
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [emails, setEmails] = useState<Mail[]>([]);
  const [selected, setSelected] = useState<Mail | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  useEffect(() => {
    const abort = new AbortController();
    void Promise.all(['/api/notifications/preferences', '/api/notifications'].map(async path => {
      const r = await fetch(path, { headers: authHeaders(), signal: abort.signal });
      if (!r.ok) throw new Error('Email settings unavailable. Reopen your account to retry.');
      return r.json();
    })).then(([p, mails]) => { setPrefs(p); setEmails(mails.emails); }).catch(e => {
      if (!abort.signal.aborted) setStatus(e instanceof Error ? e.message : 'Could not load email settings.');
    });
    return () => abort.abort();
  }, []);
  async function save(next: Preferences) {
    setBusy(true); setStatus('');
    try {
      const r = await fetch('/api/notifications/preferences', { method: 'PUT', headers: { ...authHeaders(), 'content-type': 'application/json' }, body: JSON.stringify(next) });
      if (!r.ok) throw new Error('Could not save. Please try again.');
      setPrefs(await r.json()); setStatus('Email preferences saved.');
    } catch (e) { setStatus(e instanceof Error ? e.message : 'Could not save.'); }
    finally { setBusy(false); }
  }
  return <details className="email-settings" open>
    <summary>Email settings</summary>
    {prefs ? <fieldset disabled={busy}>
      <legend className="sr-only">Email preferences</legend>
      <label><input type="checkbox" checked={prefs.watchers} onChange={e => void save({ ...prefs, watchers: e.target.checked })} />Watcher emails</label>
      <p>Alerts, reconnect reminders and watcher updates. Turning this off stops email alerts; watchers keep checking.</p>
      <label><input type="checkbox" checked={prefs.growth} onChange={e => void save({ ...prefs, growth: e.target.checked })} />Getting-started reminders</label>
      <p>At most two reminders to connect Kite. Sign-in codes are always sent.</p>
    </fieldset> : <p>Loading email preferences…</p>}
    <p role="status">{status}</p>
    {emails.length > 0 && <details><summary>Sent emails</summary><ul>{emails.map(mail => <li key={mail.id}>
      <button type="button" onClick={() => setSelected(mail)}>{mail.subject}</button>
    </li>)}</ul></details>}
    {selected && <div className="email-preview"><button type="button" onClick={() => setSelected(null)}>Close email preview</button>
      <iframe title={selected.subject} srcDoc={selected.html} sandbox="allow-popups allow-popups-to-escape-sandbox" />
    </div>}
  </details>;
}
