/**
 * utils/fillable — public API entry point.
 *
 * All consumers (prepare canvas, fill renderer, compositing export, thumbnails)
 * import from here only. Never import sub-modules directly from outside this package.
 */

export type { PdfSpace, NormalizedRect, PixelRect, RectMap, PartialFieldMap, UndoOperation } from './types';
export { GEOMETRY_SCHEMA_VERSION } from './types';

export {
  MIN_FIELD_W,
  MIN_FIELD_H,
  DEFAULT_ZOOM,
  MIN_ZOOM,
  MAX_ZOOM,
  MAX_FIT_SCALE,
  MAX_UNDO_DEPTH,
  PASTE_OFFSET,
  RESIZE_HANDLE_MIN,
  RESIZE_HANDLE_MAX,
  DELETE_BUTTON_MIN,
  DELETE_BUTTON_MAX,
  FIELD_LABEL_FONT_MIN,
  FIELD_LABEL_FONT_MAX,
  HIT_SLOP,
  DRAG_THRESHOLD_PX,
  NUDGE_COMPRESS_MS,
  FIELD_DEFAULTS,
  FIELD_COLORS,
  FIELD_BG_COLORS,
  FIELD_OVERLAY_BACKGROUND,
  FIELD_ICONS,
  FIELD_TYPES,
  generateUUID,
} from './constants';

export {
  normalizeCoord,
  clamp,
  enforceFieldBounds,
  normalizeField,
  applyDragDelta,
  applyResize,
  snapshotRects,
} from './constraints';

export {
  fieldToPixelRect,
  pixelToNormalized,
  computeRenderedSize,
  placeFieldAtTap,
  placeFieldDefault,
  buildFieldAtTap,
  buildFieldAtDefault,
} from './transforms';

export {
  computeFitScale,
  computeRenderedSize as computeRenderedSizeFromZoom,
  clampZoom,
  preserveScrollCenter,
  stepZoom,
} from './zoom';

export { sortFieldsForSave, sortFieldsForRender } from './ordering';

export {
  fieldsOnPage,
  selectionBBox,
  promoteAfterDelete,
  toggleSelection,
  setSingleSelection,
} from './selection';

export {
  applyUndoOp,
  applyRedoOp,
  compressNudgeOps,
  pushUndoOp,
} from './undoOps';

export {
  buildAlignmentOverlays,
  isDebugAlignmentEnabled,
} from './debugAlignment';
export type { AlignmentOverlay } from './debugAlignment';
