/**
 * Pure TS geometry unit tests — no RN renderer needed.
 * Run with: npx jest utils/fillable/__tests__/geometry.test.ts
 *
 * Core invariant: prepare(rect) == fill(rect) == composited rect
 * for all page sizes, zoom levels, and device sizes.
 */

import {
  normalizeCoord,
  enforceFieldBounds,
  applyDragDelta,
  applyResize,
  snapshotRects,
  fieldToPixelRect,
  pixelToNormalized,
  placeFieldAtTap,
  computeRenderedSize,
  computeFitScale,
  preserveScrollCenter,
  sortFieldsForSave,
  applyUndoOp,
  applyRedoOp,
  pushUndoOp,
  compressNudgeOps,
  generateUUID,
  PASTE_OFFSET,
  MIN_FIELD_W,
  MIN_FIELD_H,
  GEOMETRY_SCHEMA_VERSION,
} from '../index';
import type { WizardField } from '../../../types/signature';
import type { UndoOperation } from '../types';

// ─── helpers ─────────────────────────────────────────────────────────────────

function field(overrides: Partial<WizardField> & { id?: string } = {}): WizardField {
  return {
    id: overrides.id ?? 'f1',
    type: 'signature',
    label: 'Sig',
    required: false,
    page: 0,
    x: 0.1,
    y: 0.2,
    w: 0.3,
    h: 0.1,
    ...overrides,
  };
}

// ─── normalizeCoord ──────────────────────────────────────────────────────────

describe('normalizeCoord', () => {
  test('rounds to 5 decimal places', () => {
    expect(normalizeCoord(0.123456789)).toBe(0.12346);
    expect(normalizeCoord(0.5)).toBe(0.5);
    expect(normalizeCoord(1 / 3)).toBe(0.33333);
  });

  test('handles exact values without drift', () => {
    expect(normalizeCoord(0)).toBe(0);
    expect(normalizeCoord(1)).toBe(1);
  });
});

// ─── enforceFieldBounds ──────────────────────────────────────────────────────

describe('enforceFieldBounds', () => {
  test('clamps x + w to ≤ 1', () => {
    const r = enforceFieldBounds({ x: 0.8, y: 0.1, w: 0.5, h: 0.05 });
    expect(r.x + r.w).toBeLessThanOrEqual(1);
  });

  test('clamps y + h to ≤ 1', () => {
    const r = enforceFieldBounds({ x: 0.1, y: 0.95, w: 0.2, h: 0.2 });
    expect(r.y + r.h).toBeLessThanOrEqual(1);
  });

  test('enforces minimum width', () => {
    const r = enforceFieldBounds({ x: 0.1, y: 0.1, w: 0.001, h: 0.05 });
    expect(r.w).toBeGreaterThanOrEqual(MIN_FIELD_W);
  });

  test('enforces minimum height', () => {
    const r = enforceFieldBounds({ x: 0.1, y: 0.1, w: 0.2, h: 0.001 });
    expect(r.h).toBeGreaterThanOrEqual(MIN_FIELD_H);
  });

  test('rejects negative x', () => {
    const r = enforceFieldBounds({ x: -0.1, y: 0.1, w: 0.2, h: 0.05 });
    expect(r.x).toBeGreaterThanOrEqual(0);
  });

  test('rejects negative y', () => {
    const r = enforceFieldBounds({ x: 0.1, y: -0.1, w: 0.2, h: 0.05 });
    expect(r.y).toBeGreaterThanOrEqual(0);
  });

  test('is idempotent', () => {
    const r = { x: 0.1, y: 0.2, w: 0.3, h: 0.1 };
    const r1 = enforceFieldBounds(r);
    const r2 = enforceFieldBounds(r1);
    expect(r1).toEqual(r2);
  });
});

// ─── transforms round-trip invariant ─────────────────────────────────────────

describe('transforms round-trip', () => {
  const cases = [
    { renderedW: 800, renderedH: 1100 },
    { renderedW: 390, renderedH: 540 },
    { renderedW: 1200, renderedH: 1600 },
  ];

  test.each(cases)(
    'normalized → pixel → normalized round-trips within epsilon (renderedW=$renderedW)',
    ({ renderedW, renderedH }) => {
      const n = { x: 0.123456, y: 0.5, w: 0.22, h: 0.05 };
      const px = fieldToPixelRect(n, renderedW, renderedH);
      const back = pixelToNormalized(px.left, px.top, renderedW, renderedH);
      expect(back.x).toBeCloseTo(n.x, 4);
      expect(back.y).toBeCloseTo(n.y, 4);
    },
  );

  test('pixel rect has correct dimensions', () => {
    const n = { x: 0.1, y: 0.2, w: 0.3, h: 0.1 };
    const px = fieldToPixelRect(n, 1000, 1400);
    expect(px.left).toBeCloseTo(100, 3);
    expect(px.top).toBeCloseTo(280, 3);
    expect(px.width).toBeCloseTo(300, 3);
    expect(px.height).toBeCloseTo(140, 3);
  });
});

// ─── placeFieldAtTap ─────────────────────────────────────────────────────────

describe('placeFieldAtTap', () => {
  test('centers field on tap', () => {
    const rect = placeFieldAtTap(400, 550, 800, 1100, 0.28, 0.07);
    // center should be close to tap center
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    expect(cx).toBeCloseTo(400 / 800, 3);
    expect(cy).toBeCloseTo(550 / 1100, 3);
  });

  test('clamps to page when tap near edge', () => {
    const rect = placeFieldAtTap(10, 10, 800, 1100, 0.28, 0.07);
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.y).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.w).toBeLessThanOrEqual(1);
    expect(rect.y + rect.h).toBeLessThanOrEqual(1);
  });
});

// ─── applyDragDelta ──────────────────────────────────────────────────────────

describe('applyDragDelta', () => {
  test('moves field by delta', () => {
    const fields = [field({ x: 0.1, y: 0.2 })];
    const result = applyDragDelta(fields, ['f1'], 0.05, 0.1);
    expect(result[0].x).toBeCloseTo(0.15, 4);
    expect(result[0].y).toBeCloseTo(0.3, 4);
  });

  test('clamps moved field within page', () => {
    const fields = [field({ x: 0.8, y: 0.1 })];
    const result = applyDragDelta(fields, ['f1'], 0.5, 0);
    expect((result[0].x ?? 0) + (result[0].w ?? 0)).toBeLessThanOrEqual(1);
  });

  test('does not affect non-selected fields', () => {
    const f2 = field({ id: 'f2', x: 0.5, y: 0.5 });
    const fields = [field({ x: 0.1 }), f2];
    const result = applyDragDelta(fields, ['f1'], 0.1, 0.1);
    expect(result[1].x).toBe(0.5);
  });
});

// ─── applyResize ─────────────────────────────────────────────────────────────

describe('applyResize', () => {
  test('increases field size', () => {
    const fields = [field({ w: 0.2, h: 0.05 })];
    const result = applyResize(fields, 'f1', 0.05, 0.02);
    expect(result[0].w).toBeCloseTo(0.25, 4);
    expect(result[0].h).toBeCloseTo(0.07, 4);
  });

  test('enforces minimum size on shrink', () => {
    const fields = [field({ w: 0.06, h: 0.03 })];
    const result = applyResize(fields, 'f1', -0.1, -0.1);
    expect(result[0].w).toBeGreaterThanOrEqual(MIN_FIELD_W);
    expect(result[0].h).toBeGreaterThanOrEqual(MIN_FIELD_H);
  });
});

// ─── computeFitScale ─────────────────────────────────────────────────────────

describe('computeFitScale', () => {
  test('caps at MAX_FIT_SCALE', () => {
    // tiny page in large viewport → would exceed cap
    const scale = computeFitScale({ width: 100, height: 140 }, 800, 1100);
    expect(scale).toBeLessThanOrEqual(1.5);
  });

  test('fits wider page when width is constraining', () => {
    const scale = computeFitScale({ width: 800, height: 600 }, 400, 800);
    expect(scale).toBeCloseTo(0.5, 3); // viewport width = 400, page width = 800
  });
});

// ─── computeRenderedSize ─────────────────────────────────────────────────────

describe('computeRenderedSize', () => {
  test('scales correctly', () => {
    const { renderedW, renderedH } = computeRenderedSize({ width: 800, height: 1100 }, 0.5, 1.25);
    expect(renderedW).toBeCloseTo(500, 3);
    expect(renderedH).toBeCloseTo(687.5, 3);
  });
});

// ─── preserveScrollCenter ────────────────────────────────────────────────────

describe('preserveScrollCenter', () => {
  test('keeps center point stable after zoom', () => {
    const { newScrollX, newScrollY } = preserveScrollCenter(
      100, 200, 400, 600, 800, 1100, 1200, 1650,
    );
    // center was at (100 + 200, 200 + 300) = (300, 500) in old content
    // old norm: (300/800, 500/1100) = (0.375, 0.4545)
    // new pos: (0.375 * 1200 - 200, 0.4545 * 1650 - 300) = (250, 450)
    expect(newScrollX).toBeCloseTo(250, 0);
    expect(newScrollY).toBeCloseTo(450, 0);
  });

  test('does not go negative', () => {
    const { newScrollX, newScrollY } = preserveScrollCenter(0, 0, 400, 600, 800, 1100, 400, 550);
    expect(newScrollX).toBeGreaterThanOrEqual(0);
    expect(newScrollY).toBeGreaterThanOrEqual(0);
  });
});

// ─── sortFieldsForSave ───────────────────────────────────────────────────────

describe('sortFieldsForSave', () => {
  test('sorts page → y → x → id', () => {
    const fields: WizardField[] = [
      field({ id: 'c', page: 1, y: 0.1, x: 0.5 }),
      field({ id: 'a', page: 0, y: 0.5, x: 0.1 }),
      field({ id: 'b', page: 0, y: 0.2, x: 0.8 }),
    ];
    const sorted = sortFieldsForSave(fields);
    // page 0: y 0.2 (b) comes before y 0.5 (a); then page 1 (c)
    expect(sorted[0].id).toBe('b');
    expect(sorted[1].id).toBe('a');
    expect(sorted[2].id).toBe('c');
  });

  test('is stable on re-sort', () => {
    const fields = [field({ id: 'a' }), field({ id: 'b', x: 0.5 })];
    const s1 = sortFieldsForSave(fields);
    const s2 = sortFieldsForSave(s1);
    expect(s1.map((f) => f.id)).toEqual(s2.map((f) => f.id));
  });
});

// ─── undo / redo operations ──────────────────────────────────────────────────

describe('applyUndoOp / applyRedoOp', () => {
  const f1 = field({ id: 'f1', x: 0.1, y: 0.2 });
  const f2 = field({ id: 'f2', x: 0.5, y: 0.5 });

  test('undo add removes fields', () => {
    const op: UndoOperation = { type: 'add', fieldIds: ['f1'] };
    const result = applyUndoOp([f1, f2], [], op);
    expect(result.fields.map((f) => f.id)).toEqual(['f2']);
    expect(result.deleted.some((f) => f.id === 'f1')).toBe(true);
  });

  test('redo add restores fields', () => {
    const op: UndoOperation = { type: 'add', fieldIds: ['f1'] };
    const result = applyRedoOp([f2], [f1], op);
    expect(result.fields.map((f) => f.id)).toContain('f1');
    expect(result.deleted.some((f) => f.id === 'f1')).toBe(false);
  });

  test('undo delete restores fields', () => {
    const op: UndoOperation = { type: 'delete', fields: [f1] };
    const result = applyUndoOp([f2], [f1], op);
    expect(result.fields.some((f) => f.id === 'f1')).toBe(true);
    expect(result.deleted.some((f) => f.id === 'f1')).toBe(false);
  });

  test('undo move restores previous rects', () => {
    const op: UndoOperation = {
      type: 'move',
      before: { f1: { x: 0.1, y: 0.2, w: 0.3, h: 0.1 } },
      after: { f1: { x: 0.3, y: 0.4, w: 0.3, h: 0.1 } },
    };
    const movedField = { ...f1, x: 0.3, y: 0.4 };
    const result = applyUndoOp([movedField], [], op);
    expect(result.fields[0].x).toBeCloseTo(0.1, 4);
    expect(result.fields[0].y).toBeCloseTo(0.2, 4);
  });

  test('redo move applies after rects', () => {
    const op: UndoOperation = {
      type: 'move',
      before: { f1: { x: 0.1, y: 0.2, w: 0.3, h: 0.1 } },
      after: { f1: { x: 0.3, y: 0.4, w: 0.3, h: 0.1 } },
    };
    const result = applyRedoOp([f1], [], op);
    expect(result.fields[0].x).toBeCloseTo(0.3, 4);
    expect(result.fields[0].y).toBeCloseTo(0.4, 4);
  });
});

// ─── nudge compression ───────────────────────────────────────────────────────

describe('compressNudgeOps', () => {
  test('merges sequential move ops within 300ms', () => {
    const op1: UndoOperation & { _ts?: number } = {
      type: 'move',
      before: { f1: { x: 0.1, y: 0.2, w: 0.3, h: 0.1 } },
      after: { f1: { x: 0.15, y: 0.2, w: 0.3, h: 0.1 } },
      _ts: 1000,
    };
    const op2: UndoOperation = {
      type: 'move',
      before: { f1: { x: 0.15, y: 0.2, w: 0.3, h: 0.1 } },
      after: { f1: { x: 0.2, y: 0.2, w: 0.3, h: 0.1 } },
    };
    const result = compressNudgeOps([op1], op2, 1200); // 200ms later
    expect(result).toHaveLength(1);
    expect((result[0] as Extract<UndoOperation, { type: 'move' }>).before.f1.x).toBeCloseTo(0.1, 4);
    expect((result[0] as Extract<UndoOperation, { type: 'move' }>).after.f1.x).toBeCloseTo(0.2, 4);
  });

  test('does not merge ops beyond 300ms', () => {
    const op1: UndoOperation & { _ts?: number } = {
      type: 'move',
      before: { f1: { x: 0.1, y: 0.2, w: 0.3, h: 0.1 } },
      after: { f1: { x: 0.15, y: 0.2, w: 0.3, h: 0.1 } },
      _ts: 1000,
    };
    const op2: UndoOperation = {
      type: 'move',
      before: { f1: { x: 0.15, y: 0.2, w: 0.3, h: 0.1 } },
      after: { f1: { x: 0.2, y: 0.2, w: 0.3, h: 0.1 } },
    };
    const result = compressNudgeOps([op1], op2, 1400); // 400ms later
    expect(result).toHaveLength(2);
  });
});

// ─── pushUndoOp (stack cap) ──────────────────────────────────────────────────

describe('pushUndoOp', () => {
  test('enforces max depth of 50', () => {
    let stack: UndoOperation[] = [];
    for (let i = 0; i < 55; i++) {
      const op: UndoOperation = {
        type: 'move',
        before: { [`f${i}`]: { x: 0, y: 0, w: 0.1, h: 0.05 } },
        after: { [`f${i}`]: { x: 0.1, y: 0, w: 0.1, h: 0.05 } },
      };
      stack = pushUndoOp(stack, op);
    }
    expect(stack).toHaveLength(50);
  });
});

// ─── paste helpers ───────────────────────────────────────────────────────────

describe('paste offset behavior', () => {
  test('PASTE_OFFSET is 0.02', () => {
    expect(PASTE_OFFSET).toBe(0.02);
  });

  test('pasted field has new UUID', () => {
    const id1 = generateUUID();
    const id2 = generateUUID();
    expect(id1).not.toBe(id2);
    expect(id1).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  test('paste with offset and bounds enforced', () => {
    const orig = { x: 0.95, y: 0.95, w: 0.1, h: 0.05 };
    const pasted = enforceFieldBounds({
      x: orig.x + PASTE_OFFSET,
      y: orig.y + PASTE_OFFSET,
      w: orig.w,
      h: orig.h,
    });
    expect(pasted.x + pasted.w).toBeLessThanOrEqual(1);
    expect(pasted.y + pasted.h).toBeLessThanOrEqual(1);
  });
});

// ─── geometry schema version ─────────────────────────────────────────────────

test('GEOMETRY_SCHEMA_VERSION is 1', () => {
  expect(GEOMETRY_SCHEMA_VERSION).toBe(1);
});
