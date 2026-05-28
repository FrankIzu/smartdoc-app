/**
 * Selection model helpers (v1: page-scoped).
 *
 * Invariants:
 * - primarySelectedFieldId is always the last item in selectedFieldIds, or null
 * - selectedFieldIds only references live (non-deleted) fields on currentPage
 * - Navigating pages clears selection
 * - Deleting primary promotes previous selected id or clears
 */

import type { NormalizedRect } from './types';
import type { WizardField } from '../../types/signature';

/**
 * Get live fields on the given page (not deleted).
 */
export function fieldsOnPage(fields: WizardField[], page: number): WizardField[] {
  return fields.filter((f) => !f.deleted && (f.page ?? 0) === page);
}

/**
 * Compute the bounding box of a set of selected fields (normalized coords).
 */
export function selectionBBox(
  fields: WizardField[],
  selectedIds: string[],
): NormalizedRect | null {
  const selected = fields.filter((f) => selectedIds.includes(f.id));
  if (!selected.length) return null;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const f of selected) {
    const x = f.x ?? 0;
    const y = f.y ?? 0;
    const w = f.w ?? 0;
    const h = f.h ?? 0;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + w);
    maxY = Math.max(maxY, y + h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/**
 * After deleting the primary field, compute new primary:
 * promote the previous selected id, or null.
 */
export function promoteAfterDelete(
  selectedIds: string[],
  deletedId: string,
): { selectedIds: string[]; primaryId: string | null } {
  const remaining = selectedIds.filter((id) => id !== deletedId);
  return {
    selectedIds: remaining,
    primaryId: remaining.length > 0 ? remaining[remaining.length - 1] : null,
  };
}

/**
 * Toggle a field in the multi-select set.
 * Primary is always the last selected.
 */
export function toggleSelection(
  current: string[],
  fieldId: string,
): { selectedIds: string[]; primaryId: string | null } {
  const already = current.includes(fieldId);
  const next = already ? current.filter((id) => id !== fieldId) : [...current, fieldId];
  return {
    selectedIds: next,
    primaryId: next.length > 0 ? next[next.length - 1] : null,
  };
}

/**
 * Set a single selection (click without multi-select modifier).
 */
export function setSingleSelection(fieldId: string): {
  selectedIds: string[];
  primaryId: string;
} {
  return { selectedIds: [fieldId], primaryId: fieldId };
}
