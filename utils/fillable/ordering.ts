/**
 * Deterministic field ordering for save and render.
 *
 * Save sort: page ASC → y ASC → x ASC → id ASC
 * Reduces JSON churn and aids diff stability.
 */

import type { WizardField } from '../../types/signature';

/** Sort fields for PATCH payload: page → y → x → id. */
export function sortFieldsForSave(fields: WizardField[]): WizardField[] {
  return [...fields].sort((a, b) => {
    const pa = a.page ?? 0;
    const pb = b.page ?? 0;
    if (pa !== pb) return pa - pb;
    const ya = a.y ?? 0;
    const yb = b.y ?? 0;
    if (ya !== yb) return ya - yb;
    const xa = a.x ?? 0;
    const xb = b.x ?? 0;
    if (xa !== xb) return xa - xb;
    return a.id.localeCompare(b.id);
  });
}

/**
 * Sort fields for rendering (z-index order).
 * Base: stable page → y → x. The caller then lifts selected/primary on top.
 */
export function sortFieldsForRender(
  fields: WizardField[],
  selectedIds: string[],
  primaryId: string | null,
): WizardField[] {
  const base = [...fields].sort((a, b) => {
    const pa = a.page ?? 0;
    const pb = b.page ?? 0;
    if (pa !== pb) return pa - pb;
    // lastTouchedAt bump: recently touched renders higher
    const ta = (a as WizardField & { lastTouchedAt?: number }).lastTouchedAt ?? 0;
    const tb = (b as WizardField & { lastTouchedAt?: number }).lastTouchedAt ?? 0;
    if (ta !== tb) return ta - tb;
    const ya = a.y ?? 0;
    const yb = b.y ?? 0;
    if (ya !== yb) return ya - yb;
    return (a.x ?? 0) - (b.x ?? 0);
  });

  // Lift selected fields to top, primary last (highest)
  const unselected = base.filter((f) => !selectedIds.includes(f.id));
  const nonPrimary = base.filter((f) => selectedIds.includes(f.id) && f.id !== primaryId);
  const primary = primaryId ? base.filter((f) => f.id === primaryId) : [];
  return [...unselected, ...nonPrimary, ...primary];
}
