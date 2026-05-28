/**
 * Operation-based undo/redo engine.
 *
 * Max 50 operations (not snapshots — much smaller footprint for 100+ field templates).
 * Push one operation at gesture/action start, not per frame.
 * Redo = inverse operation.
 * Nudge compression: sequential move/update ops within 300ms collapse into one.
 */

import type { UndoOperation, RectMap, PartialFieldMap } from './types';
import type { WizardField } from '../../types/signature';
import { enforceFieldBounds, normalizeCoord } from './constraints';
import { MAX_UNDO_DEPTH, NUDGE_COMPRESS_MS } from './constants';

/** Apply an undo operation (forward = redo, reverse = undo). */
export function applyUndoOp(
  fields: WizardField[],
  deleted: WizardField[],
  op: UndoOperation,
): { fields: WizardField[]; deleted: WizardField[] } {
  switch (op.type) {
    case 'add': {
      // Undo add = delete the added fields
      const newDeleted = fields
        .filter((f) => op.fieldIds.includes(f.id))
        .map((f) => ({ ...f, deleted: true }));
      return {
        fields: fields.filter((f) => !op.fieldIds.includes(f.id)),
        deleted: [...deleted, ...newDeleted],
      };
    }
    case 'delete': {
      // Undo delete = restore the deleted fields
      const idsToRestore = op.fields.map((f) => f.id);
      return {
        fields: [...fields, ...op.fields.map((f) => ({ ...f, deleted: undefined }))],
        deleted: deleted.filter((f) => !idsToRestore.includes(f.id)),
      };
    }
    case 'move':
    case 'resize': {
      // Apply "before" rects (undo) or "after" rects (redo) — caller picks correct op
      const rects = op.before;
      return {
        fields: applyRectMap(fields, rects),
        deleted,
      };
    }
    case 'update': {
      return {
        fields: applyPartialMap(fields, op.before),
        deleted,
      };
    }
    case 'batch': {
      // Undo ops in reverse order
      let f = fields;
      let d = deleted;
      for (const subOp of [...op.ops].reverse()) {
        const result = applyUndoOp(f, d, subOp);
        f = result.fields;
        d = result.deleted;
      }
      return { fields: f, deleted: d };
    }
  }
}

/** Apply an undo operation in reverse (redo direction). */
export function applyRedoOp(
  fields: WizardField[],
  deleted: WizardField[],
  op: UndoOperation,
): { fields: WizardField[]; deleted: WizardField[] } {
  switch (op.type) {
    case 'add': {
      // Redo add = restore the fields
      const toRestore = deleted.filter((f) => op.fieldIds.includes(f.id));
      return {
        fields: [...fields, ...toRestore.map((f) => ({ ...f, deleted: undefined }))],
        deleted: deleted.filter((f) => !op.fieldIds.includes(f.id)),
      };
    }
    case 'delete': {
      // Redo delete = soft-delete again
      const idsToDelete = op.fields.map((f) => f.id);
      const toDelete = fields
        .filter((f) => idsToDelete.includes(f.id))
        .map((f) => ({ ...f, deleted: true }));
      return {
        fields: fields.filter((f) => !idsToDelete.includes(f.id)),
        deleted: [...deleted, ...toDelete],
      };
    }
    case 'move':
    case 'resize': {
      // Redo = apply "after" rects
      return {
        fields: applyRectMap(fields, op.after),
        deleted,
      };
    }
    case 'update': {
      return {
        fields: applyPartialMap(fields, op.after),
        deleted,
      };
    }
    case 'batch': {
      let f = fields;
      let d = deleted;
      for (const subOp of op.ops) {
        const result = applyRedoOp(f, d, subOp);
        f = result.fields;
        d = result.deleted;
      }
      return { fields: f, deleted: d };
    }
  }
}

/** Attempt to compress the last nudge op on the stack with a new one. */
export function compressNudgeOps(
  stack: Array<UndoOperation & { _ts?: number }>,
  newOp: (UndoOperation & { _ts?: number }) | null,
  now: number,
): Array<UndoOperation & { _ts?: number }> {
  if (!newOp) return stack;
  if (stack.length === 0) return [...stack, { ...newOp, _ts: now }];

  const last = stack[stack.length - 1];
  if (
    last._ts != null &&
    now - last._ts <= NUDGE_COMPRESS_MS &&
    last.type === 'move' &&
    newOp.type === 'move'
  ) {
    // Merge: keep last.before, take newOp.after
    const merged: UndoOperation & { _ts?: number } = {
      type: 'move',
      before: last.before,
      after: newOp.after,
      _ts: now,
    };
    return [...stack.slice(0, -1), merged];
  }

  return [...stack, { ...newOp, _ts: now }];
}

/** Push an op onto the undo stack, respecting max depth. */
export function pushUndoOp(
  stack: UndoOperation[],
  op: UndoOperation,
): UndoOperation[] {
  const next = [...stack, op];
  if (next.length > MAX_UNDO_DEPTH) return next.slice(next.length - MAX_UNDO_DEPTH);
  return next;
}

// --- internal helpers ---

function applyRectMap(fields: WizardField[], rects: RectMap): WizardField[] {
  return fields.map((f) => {
    const r = rects[f.id];
    if (!r) return f;
    const bounded = enforceFieldBounds(r);
    return { ...f, ...bounded };
  });
}

function applyPartialMap(fields: WizardField[], map: PartialFieldMap): WizardField[] {
  return fields.map((f) => {
    const patch = map[f.id];
    if (!patch) return f;
    const merged = { ...f, ...patch };
    // Re-enforce bounds if geometry changed
    if (merged.x != null && merged.y != null && merged.w != null && merged.h != null) {
      const bounded = enforceFieldBounds({ x: merged.x, y: merged.y, w: merged.w, h: merged.h });
      return { ...merged, ...bounded };
    }
    return merged;
  });
}
