import { notFound } from 'next/navigation';
import flowsFile from './flows.json';
import statusFile from './status.json';

/**
 * The state lab (plan-v2-ui §3): every state of every markets-hero flow, opened
 * directly from fixture data so it can be built and compared with the
 * prototype's screenshot before real data is wired. Development only — a
 * production build answers 404 unless V2_LAB=1.
 */
export function assertLab(): void {
  if (process.env.NODE_ENV === 'production' && process.env.V2_LAB !== '1') notFound();
}

export interface FlowState {
  id: string;
  label: string;
  note: string;
  /** false = the prototype keeps no reference screenshot for this state. */
  screenshot: boolean;
}

export interface Flow {
  id: string;
  title: string;
  summary: string;
  shell: 'home' | 'chat';
  default: string;
  group: string;
  states: FlowState[];
  exits: { on: string; to: string; state: string }[];
  events: { name: string; when: string }[];
}

export type ParityStatus = 'todo' | 'lab' | 'wired' | 'done';

export const SOURCE_COMMIT: string = flowsFile.sourceCommit;
export const FLOWS = flowsFile.flows as Flow[];

const status = statusFile as Record<string, ParityStatus>;

/** todo → lab (matches the screenshot from fixtures) → wired (real data) → done (motion checklist walked). */
export const parityOf = (flow: string, state: string): ParityStatus => status[`${flow}:${state}`] ?? 'todo';
