import { Pool, type PoolClient } from 'pg';
import { pgConfig } from '@/agent/lib/db/client';
import { EMAIL_FROM } from '../emails';
import { notificationContent, type WatchEmailData } from './content';
import { watcherChart } from './chart';
import { DAY, deliveryDecision, istAt, istDay, nextWindow, tradingDay } from './policy';
import type { MessageKind } from './render';

interface Job {
  id: string; user_id: string; kind: MessageKind; subject_id: string | null;
  payload: Record<string, unknown>; due_at: Date; expires_at: Date; created_at: Date;
  attempts: number; provider_payload: Record<string, unknown> | null; first_attempt_at: Date | null;
}
const globalPool = globalThis as unknown as { notificationPool?: Pool };
function pool() {
  return globalPool.notificationPool ??= new Pool({ ...pgConfig(process.env.DATABASE_URL ?? ''), max: 2 });
}

async function schedule(client: PoolClient, now: Date) {
  // Enrollment occurs only on first account creation, never on a returning login.
  await client.query(`INSERT INTO eve.notification_jobs(id,user_id,kind,payload,due_at,expires_at)
    SELECT 'nudge:'||p.user_id||':'||d.day,p.user_id,'kite-nudge',jsonb_build_object('day',d.day),
      p.enrolled_at + d.day * interval '1 day', p.enrolled_at + interval '14 days'
    FROM eve.notification_preferences p CROSS JOIN (VALUES (1),(3)) d(day)
    WHERE p.enrolled_at IS NOT NULL AND p.growth AND NOT EXISTS
      (SELECT 1 FROM broker_connections b WHERE b.user_id=p.user_id)
    ON CONFLICT DO NOTHING`);
  const holidays = JSON.parse(process.env.NOTIFICATION_MARKET_HOLIDAYS ?? '{}') as Record<string, string[]>;
  const { rows } = await client.query(`SELECT b.user_id,b.connected_at,b.expires_at,
      array_agg(DISTINCT w.market) AS markets FROM broker_connections b JOIN watchers w ON w.user_id=b.user_id
    WHERE b.status <> 'disconnected' AND b.expires_at <= $1 AND w.status='PAUSED' AND w.paused_by='broker'
      AND w.expires_at > $1 GROUP BY b.user_id,b.connected_at,b.expires_at`, [now]);
  for (const b of rows) {
    if (!b.markets.some((m: string) => tradingDay(now, m, holidays))) continue;
    const episode = new Date(b.connected_at).toISOString();
    const day = istDay(now);
    const count = await client.query(`SELECT count(*)::int AS n FROM eve.notification_jobs
      WHERE user_id=$1 AND kind='kite-reconnect' AND payload->>'episode'=$2 AND state='sent'`, [b.user_id, episode]);
    if (count.rows[0].n >= 2) continue;
    await client.query(`INSERT INTO eve.notification_jobs(id,user_id,kind,payload,due_at,expires_at)
      VALUES ($1,$2,'kite-reconnect',$3,$4,$5) ON CONFLICT DO NOTHING`,
    [`reconnect:${b.user_id}:${episode}:${day}`, b.user_id, { episode, last: count.rows[0].n === 1 },
      istAt(day, 8), istAt(day, 20)]);
  }
  await client.query(`DELETE FROM eve.watcher_observations WHERE at < $1`, [new Date(now.getTime() - 90 * DAY)]);
}

/** Durable queue, one cross-process worker, provider idempotency for ambiguous retries. */
export async function deliverNotifications(now = new Date()) {
  const client = await pool().connect();
  const report = { sent: 0, suppressed: 0, failed: 0, waiting: 0, enabled: false };
  let locked = false;
  try {
    locked = (await client.query(`SELECT pg_try_advisory_lock(684221, 11) AS locked`)).rows[0].locked;
    if (!locked) return report;
    report.enabled = Boolean((await client.query(`SELECT enabled FROM eve.notification_control WHERE id=1`)).rows[0]?.enabled);
    if (!report.enabled) return report;
    if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY is required for notification delivery');
    await schedule(client, now);
    const jobs = await client.query<Job>(`SELECT * FROM eve.notification_jobs
      WHERE state='pending' AND due_at <= $1 ORDER BY (kind='watcher-alert') DESC, due_at LIMIT 50`, [now]);
    for (const job of jobs.rows) {
      const user = (await client.query(`SELECT u.email,coalesce(p.watchers,true) AS watchers,
        coalesce(p.growth,true) AS growth FROM users u LEFT JOIN eve.notification_preferences p ON p.user_id=u.id
        WHERE u.id=$1`, [job.user_id])).rows[0];
      const broker = (await client.query(`SELECT * FROM broker_connections WHERE user_id=$1`, [job.user_id])).rows[0];
      let watch: WatchEmailData & { status: string; last_error: string | null } | undefined;
      if (job.subject_id) watch = (await client.query(`SELECT w.*, l.thread_id, t.title FROM watchers w
        LEFT JOIN eve.watcher_links l ON l.watcher_id=w.id AND l.user_id=w.user_id
        LEFT JOIN eve.threads t ON t.id=l.thread_id AND t.deleted_at IS NULL
        WHERE w.id=$1 AND w.user_id=$2`, [job.subject_id, job.user_id])).rows[0];
      const paused = job.kind === 'kite-reconnect' ? (await client.query<WatchEmailData>(`SELECT * FROM watchers
        WHERE user_id=$1 AND status='PAUSED' AND paused_by='broker' AND expires_at>$2`, [job.user_id, now])).rows : [];
      let stale = !user || Boolean(job.subject_id && !watch);
      if (job.kind === 'kite-nudge') {
        stale ||= Boolean(broker);
        if (job.payload.day === 3) {
          const first = (await client.query(`SELECT state FROM eve.notification_jobs WHERE id=$1`, [`nudge:${job.user_id}:1`])).rows[0];
          if (first?.state !== 'sent') {
            if (now >= job.expires_at || first?.state === 'suppressed' || first?.state === 'failed') stale = true;
            else { report.waiting++; continue; }
          }
        }
      }
      if (job.kind === 'kite-reconnect') {
        const count = (await client.query(`SELECT count(*)::int AS n FROM eve.notification_jobs WHERE user_id=$1
          AND kind='kite-reconnect' AND payload->>'episode'=$2 AND state='sent'`, [job.user_id, job.payload.episode])).rows[0].n;
        stale ||= !paused.length || !broker || broker.status === 'disconnected' || new Date(broker.expires_at) > now
          || new Date(broker.connected_at).toISOString() !== job.payload.episode || count >= 2;
      }
      if (job.kind === 'watcher-stopped') stale ||= watch?.status !== 'ERROR' || watch?.last_error !== job.payload.error;
      if (job.kind === 'watcher-ended') stale ||= watch?.status !== 'EXPIRED';
      const today = (await client.query(`SELECT count(*)::int AS n FROM eve.notification_jobs WHERE user_id=$1
        AND kind <> 'watcher-alert' AND id <> $2 AND state <> 'suppressed'
        AND (sent_at >= $3 OR first_attempt_at >= $3)`, [job.user_id, job.id, istAt(istDay(now), 0)])).rows[0].n;
      const decision = deliveryDecision({ kind: job.kind, now, dueAt: job.due_at, expiresAt: job.expires_at,
        watchers: user?.watchers ?? false, growth: user?.growth ?? false, sentToday: today, stale });
      if (decision === 'suppress') {
        await client.query(`UPDATE eve.notification_jobs SET state='suppressed' WHERE id=$1`, [job.id]); report.suppressed++; continue;
      }
      if (decision === 'wait') {
        const next = today >= 2 ? istAt(istDay(new Date(now.getTime() + DAY)), 8) : nextWindow(now);
        await client.query(`UPDATE eve.notification_jobs SET due_at=$2 WHERE id=$1`, [job.id, next]); report.waiting++; continue;
      }
      // Resend remembers keys for 24h. Do not blindly replay an ambiguous send beyond that window.
      if (job.first_attempt_at && now.getTime() - job.first_attempt_at.getTime() >= 23 * 3600_000) {
        await client.query(`UPDATE eve.notification_jobs SET state='failed',last_error='Delivery needs reconciliation before retry' WHERE id=$1`, [job.id]);
        report.failed++; continue;
      }
      try {
        let body = job.provider_payload;
        if (!body) {
          let chart: string | null = null;
          const payload = { ...job.payload };
          if (watch && job.kind === 'watcher-alert') {
            const samples = (await client.query(`SELECT at,value FROM eve.watcher_observations WHERE watcher_id=$1
              AND good_check AND at <= $2 ORDER BY at DESC LIMIT 47`, [watch.id, payload.at])).rows.reverse();
            samples.push({ at: payload.at, value: payload.value });
            chart = (await watcherChart(samples, `${watch.symbol} · recorded watcher values`)).toString('base64');
          }
          if (watch && job.kind === 'watcher-stopped') {
            payload.lastGood = (await client.query(`SELECT at FROM eve.watcher_observations WHERE watcher_id=$1
              AND good_check ORDER BY at DESC LIMIT 1`, [watch.id])).rows[0]?.at?.toISOString();
          }
          if (watch && job.kind === 'watcher-ended') {
            payload.sentCount = (await client.query(`SELECT count(*)::int AS n
              FROM watcher_fires WHERE watcher_id=$1 AND emailed`, [watch.id])).rows[0].n;
            const durations = (await client.query(`SELECT
              coalesce(sum(extract(epoch FROM stop-at)) FILTER (WHERE status='PAUSED'),0) AS paused,
              coalesce(sum(extract(epoch FROM stop-at)),0) AS total FROM (
                SELECT at,status,lead(at,1,$2::timestamptz) OVER (ORDER BY at,id) AS stop
                FROM eve.watcher_observations WHERE watcher_id=$1 AND at <= $2
              ) history`, [watch.id, watch.expires_at])).rows[0];
            payload.pausedMostly = payload.sentCount === 0 && Number(durations.total) > 0 && Number(durations.paused) > Number(durations.total) / 2;
          }
          const mail = notificationContent(job.kind, user.email, payload, watch, paused);
          body = { from: EMAIL_FROM, to: [user.email], ...mail,
            ...(chart ? { attachments: [{ filename: 'watcher.png', content: chart, content_type: 'image/png', content_id: 'watcher-chart' }] } : {}) };
          await client.query(`UPDATE eve.notification_jobs SET provider_payload=$2,subject=$3,html=$4,plain_text=$5,
            chart_png=$6 WHERE id=$1`, [job.id, body, mail.subject, mail.html, mail.text, chart]);
        }
        await client.query(`UPDATE eve.notification_jobs SET attempts=attempts+1,first_attempt_at=coalesce(first_attempt_at,$2) WHERE id=$1`, [job.id, now]);
        const res = await fetch('https://api.resend.com/emails', { method: 'POST', signal: AbortSignal.timeout(10_000),
          headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json', 'Idempotency-Key': job.id }, body: JSON.stringify(body) });
        if (!res.ok) throw new Error(`Mail provider returned ${res.status}`);
        const sent = await res.json() as { id?: string };
        if (!sent.id) throw new Error('Mail provider did not return an id');
        await client.query('BEGIN');
        try {
          await client.query(`UPDATE eve.notification_jobs SET state='sent',sent_at=$2,provider_id=$3,last_error=NULL WHERE id=$1`, [job.id, now, sent.id]);
          if (job.kind === 'watcher-alert') await client.query(`UPDATE watcher_fires SET emailed=true WHERE id=$1`, [job.payload.fireId]);
          await client.query('COMMIT');
        } catch (error) { await client.query('ROLLBACK'); throw error; }
        report.sent++;
      } catch (error) {
        await client.query(`UPDATE eve.notification_jobs SET last_error=$2,due_at=$3 WHERE id=$1`,
          [job.id, error instanceof Error ? error.message : 'Delivery failed', new Date(now.getTime() + Math.min(3600, 60 * 2 ** Math.min(job.attempts, 6)) * 1000)]);
        report.failed++;
      }
      if (report.sent + report.failed >= 20) break;
    }
    return report;
  } finally {
    if (locked) await client.query('SELECT pg_advisory_unlock(684221, 11)');
    client.release();
  }
}
