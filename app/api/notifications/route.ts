import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/agent/lib/db/client';
import { notificationJobs } from '@/agent/lib/db/schema';
import { requireUser, errorResponse } from '@/lib/server/auth';

export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    const rows = await db().select({ id: notificationJobs.id, subject: notificationJobs.subject, sentAt: notificationJobs.sentAt,
      html: notificationJobs.html, text: notificationJobs.plainText, chart: notificationJobs.chartPng })
      .from(notificationJobs).where(and(eq(notificationJobs.userId, user.userId), eq(notificationJobs.state, 'sent')))
      .orderBy(desc(notificationJobs.sentAt)).limit(30);
    return Response.json({ emails: rows.map(r => ({ ...r, chart: undefined,
      html: r.html?.replace('cid:watcher-chart', `data:image/png;base64,${r.chart ?? ''}`) })) },
    { headers: { 'cache-control': 'no-store' } });
  } catch (error) { return errorResponse(error); }
}
