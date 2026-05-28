/**
 * Coordinate space types for the fillable-field geometry engine.
 *
 * Only legal transform chain:
 *   PdfSpace (intrinsic JPEG dims)
 *     → NormalizedRect (0..1 fractions, persisted to backend)
 *     → PixelRect (layout-space dp, used for overlay rendering)
 *
 * Never convert pixel→pixel or screen→screen outside the approved functions
 * in transforms.ts.
 */

import type { WizardField } from '../../types/signature';

/** Intrinsic size of the delivered page JPEG (from Image onLoad). */
export type PdfSpace = { width: number; height: number };

/**
 * Persisted to backend — fractions of page width/height, top-left origin.
 * Each value is in [0, 1].
 */
export type NormalizedRect = { x: number; y: number; w: number; h: number };

/**
 * Layout-space pixels for overlay rendering (NOT physical/DPR pixels).
 * All overlay math uses layout dp; DPR conversion only at raster export.
 */
export type PixelRect = { left: number; top: number; width: number; height: number };

/** Map from field id → NormalizedRect (used in undo ops). */
export type RectMap = Record<string, NormalizedRect>;

/** Map from field id → partial WizardField (used in undo ops). */
export type PartialFieldMap = Record<string, Partial<WizardField>>;

/**
 * json_fields.version is the geometry schema version.
 * v1 = normalized top-left 0..1 rects, upright JPEGs from server.
 */
export const GEOMETRY_SCHEMA_VERSION = 1 as const;

/**
 * Operation-based undo entries (max 50 in stack).
 * Much smaller memory footprint than full snapshots for 100+ field templates.
 */
export type UndoOperation =
  | { type: 'add'; fieldIds: string[] }
  | { type: 'delete'; fields: WizardField[] }
  | { type: 'move'; before: RectMap; after: RectMap }
  | { type: 'resize'; before: RectMap; after: RectMap }
  | { type: 'update'; before: PartialFieldMap; after: PartialFieldMap }
  | { type: 'batch'; ops: UndoOperation[] };
