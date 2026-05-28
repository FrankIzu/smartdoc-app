/**
 * Constraint and normalization functions.
 *
 * ALL mutating geometry paths (place, drag, resize, paste, nudge,
 * page-move, undo/redo replay, save) call these centrally.
 * No caller may bypass enforceFieldBounds or normalizeCoord.
 */

import type { NormalizedRect, RectMap } from './types';
import type { WizardField } from '../../types/signature';
import { MIN_FIELD_W, MIN_FIELD_H } from './constants';

/** Round to 5 decimal places — all persisted coords pass through here. */
export function normalizeCoord(n: number): number {
  return Math.round(n * 100000) / 100000;
}

/** Clamp n to [lo, hi]. */
export function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** Enforce all field bounds: x>=0, y>=0, w>=MIN_W, h>=MIN_H, x+w<=1, y+h<=1. */
export function enforceFieldBounds(rect: NormalizedRect): NormalizedRect {
  const w = Math.max(MIN_FIELD_W, normalizeCoord(rect.w));
  const h = Math.max(MIN_FIELD_H, normalizeCoord(rect.h));
  const x = normalizeCoord(clamp(rect.x, 0, 1 - w));
  const y = normalizeCoord(clamp(rect.y, 0, 1 - h));
  return { x, y, w, h };
}

/** Normalize and enforce bounds on a full WizardField, returning a new object. */
export function normalizeField(field: WizardField): WizardField {
  if (
    field.x == null || field.y == null ||
    field.w == null || field.h == null
  ) return field;
  const { x, y, w, h } = enforceFieldBounds({
    x: field.x, y: field.y, w: field.w, h: field.h,
  });
  return { ...field, x, y, w, h };
}

/**
 * Apply a drag delta (in normalized units) to multiple fields simultaneously.
 * Clamps each field individually so none escapes the page.
 */
export function applyDragDelta(
  fields: WizardField[],
  fieldIds: string[],
  dx: number,
  dy: number,
): WizardField[] {
  return fields.map((f) => {
    if (!fieldIds.includes(f.id)) return f;
    if (f.x == null || f.y == null || f.w == null || f.h == null) return f;
    const newRect = enforceFieldBounds({
      x: f.x + dx,
      y: f.y + dy,
      w: f.w,
      h: f.h,
    });
    return { ...f, ...newRect };
  });
}

/**
 * Apply a resize delta to a single field.
 * dw/dh are in normalized units.
 */
export function applyResize(
  fields: WizardField[],
  fieldId: string,
  dw: number,
  dh: number,
): WizardField[] {
  return fields.map((f) => {
    if (f.id !== fieldId) return f;
    if (f.x == null || f.y == null || f.w == null || f.h == null) return f;
    const newRect = enforceFieldBounds({
      x: f.x,
      y: f.y,
      w: f.w + dw,
      h: f.h + dh,
    });
    return { ...f, ...newRect };
  });
}

/** Snapshot current rects for an undo operation. */
export function snapshotRects(fields: WizardField[], ids: string[]): RectMap {
  const map: RectMap = {};
  for (const f of fields) {
    if (ids.includes(f.id) && f.x != null && f.y != null && f.w != null && f.h != null) {
      map[f.id] = { x: f.x, y: f.y, w: f.w, h: f.h };
    }
  }
  return map;
}
