import type { EveMessage, EveMessagePart } from 'eve/react';
import type { MessagePart } from '@/agent/lib/db/types';
import { buildAnswer, timeOf, type AnswerModel, type ToolActivity } from './answer-model';

/**
 * Adapters from the two part shapes to the answer model: the live eve
 * message (AI-SDK style parts with lifecycle states) and the persisted
 * `MessagePart[]` (tool_call / tool_result / tool_error).
 */

/** Timestamps per tool call, read from the raw stream (`meta.at`) when it carries them. */
export interface CallTimes {
  requested: Map<string, number>;
  resulted: Map<string, number>;
}

export function callTimes(events: readonly unknown[]): CallTimes {
  const requested = new Map<string, number>();
  const resulted = new Map<string, number>();
  for (const raw of events) {
    const e = raw as { type?: string; meta?: { at?: string }; data?: { actions?: { callId?: string }[]; result?: { callId?: string } } };
    const at = e.meta?.at ? Date.parse(e.meta.at) : Number.NaN;
    if (!Number.isFinite(at)) continue;
    if (e.type === 'actions.requested') for (const a of e.data?.actions ?? []) if (a.callId) requested.set(a.callId, at);
    if (e.type === 'action.result' && e.data?.result?.callId) resulted.set(e.data.result.callId, at);
  }
  return { requested, resulted };
}

export function liveAnswer(message: EveMessage, opts: { streaming: boolean; stopped?: boolean; error?: string; times?: CallTimes }): AnswerModel {
  const tools: ToolActivity[] = [];
  const texts: string[] = [];
  for (const part of message.parts as readonly EveMessagePart[]) {
    if (part.type === 'text') texts.push(part.text);
    if (part.type !== 'dynamic-tool') continue;
    const req = opts.times?.requested.get(part.toolCallId);
    const res = opts.times?.resulted.get(part.toolCallId);
    const elapsedMs = req !== undefined && res !== undefined ? Math.max(0, res - req) : undefined;
    const at = res !== undefined ? timeOf(new Date(res).toISOString()) : undefined;
    const base = { callId: part.toolCallId, toolName: part.toolName, input: part.input, at, elapsedMs };
    switch (part.state) {
      case 'output-available':
        tools.push({ ...base, output: part.output, state: 'ok' });
        break;
      case 'output-error':
        tools.push({ ...base, error: part.errorText, state: 'error' });
        break;
      case 'output-denied':
        tools.push({ ...base, state: 'denied' });
        break;
      case 'approval-requested': {
        const req = part.toolMetadata?.eve?.inputRequest;
        const opts = req?.options ?? [];
        const approveId = opts.find((o) => /approve|allow|yes/i.test(`${o.id} ${o.label}`))?.id ?? 'approve';
        const rejectId = opts.find((o) => /reject|deny|no\b/i.test(`${o.id} ${o.label}`))?.id ?? 'reject';
        tools.push({ ...base, state: 'awaiting', approval: req ? { requestId: req.requestId, approveId, rejectId } : undefined });
        break;
      }
      case 'approval-responded':
        tools.push({ ...base, state: part.approval.approved === false ? 'denied' : 'running' });
        break;
      default:
        tools.push({ ...base, state: 'running' });
    }
  }
  // A call parked for approval means the turn is waiting on the user: the answer is as done as it gets.
  const parked = tools.some((t) => t.state === 'awaiting');
  return buildAnswer({ text: texts.join('\n\n'), tools, streaming: opts.streaming && !parked, stopped: opts.stopped, error: opts.error });
}

export function storedAnswer(content: string, parts: MessagePart[], createdAt: string): AnswerModel {
  const byCall = new Map<string, ToolActivity>();
  const order: string[] = [];
  for (const p of parts) {
    if (p.type === 'tool_call') {
      byCall.set(p.toolCallId, { callId: p.toolCallId, toolName: p.toolName, input: p.input, state: 'running', at: timeOf(createdAt) });
      order.push(p.toolCallId);
    } else {
      const a = byCall.get(p.toolCallId) ?? { callId: p.toolCallId, toolName: p.toolName, input: undefined, state: 'running' as const, at: timeOf(createdAt) };
      if (!byCall.has(p.toolCallId)) {
        byCall.set(p.toolCallId, a);
        order.push(p.toolCallId);
      }
      if (p.type === 'tool_result') {
        a.output = p.output;
        a.state = 'ok';
      } else if (p.type === 'input_request') {
        // Parked for approval and never answered: the confirm card comes back on reload.
        if (a.state === 'running') {
          const approveId = p.options.find((o) => /approve|allow|yes/i.test(`${o.id} ${o.label ?? ''}`))?.id ?? 'approve';
          const rejectId = p.options.find((o) => /reject|deny|no\b/i.test(`${o.id} ${o.label ?? ''}`))?.id ?? 'reject';
          a.state = 'awaiting';
          a.approval = { requestId: p.requestId, approveId, rejectId };
        }
      } else {
        a.error = p.error;
        a.state = p.error === 'Declined by user' ? 'denied' : 'error';
      }
    }
  }
  const tools = order.map((id) => byCall.get(id) as ToolActivity);
  // A call that never got a result in a finished turn was cut off (a parked approval is not).
  for (const t of tools) if (t.state === 'running') t.state = 'error';
  return buildAnswer({ text: content, tools, streaming: false, at: timeOf(createdAt) });
}
