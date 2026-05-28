import type { AiFmPlanPayload, GateType, PlanResponse } from '../types/aiFileManager';
import { formatUserFacingPlanMessage } from './formatPlanPreview';

export function formatPlanPreview(plan?: AiFmPlanPayload | null): string {
  if (!plan) return 'No plan details available.';
  return formatUserFacingPlanMessage(plan as Record<string, unknown>);
}

/** Rebuild gate queue from latest /plan response — replace only, never merge. */
export function buildGateQueue(response: PlanResponse): GateType[] {
  const queue: GateType[] = [];
  if (response.folder_scope_suggestion_required) queue.push('folder_scope');
  if (response.scope_confirmation_required) queue.push('scope');
  if (response.rename_clarification_required) queue.push('rename');
  if (response.schedule_required) queue.push('schedule');
  // high_risk is execute-only — not in plan round-trip queue
  return queue;
}

export function planToHistoryTurns(message: string): Array<{ role: string; content: string }> {
  return [{ role: 'user', content: message }];
}

export function isPendingHistoryStatus(status?: string): boolean {
  if (!status) return false;
  const s = status.toLowerCase();
  return s === 'pending' || s === 'awaiting_execution' || s === 'planned';
}

export function isCompletedHistoryStatus(status?: string): boolean {
  if (!status) return false;
  const s = status.toLowerCase();
  return s === 'completed' || s === 'executed' || s === 'success';
}

export function parseAiFmTelemetry(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw === 'string') {
    try {
      const o = JSON.parse(raw) as unknown;
      return o && typeof o === 'object' && !Array.isArray(o) ? (o as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return {};
}
