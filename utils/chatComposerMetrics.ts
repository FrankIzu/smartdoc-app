/** Shared multiline chat composer sizing (5 visible lines). */
export const CHAT_COMPOSER_LINE_HEIGHT = 22;
export const CHAT_COMPOSER_V_PAD = 3;
export const CHAT_COMPOSER_FONT_SIZE = 16;
export const CHAT_COMPOSER_MIN_HEIGHT = 40;
export const CHAT_COMPOSER_MAX_LINES = 5;
/** Exactly 5 lines of text plus symmetric vertical padding. */
export const CHAT_COMPOSER_MAX_HEIGHT =
  CHAT_COMPOSER_MAX_LINES * CHAT_COMPOSER_LINE_HEIGHT + 2 * CHAT_COMPOSER_V_PAD;

export function clampComposerHeight(height: number): number {
  if (!Number.isFinite(height) || height <= 0) return CHAT_COMPOSER_MIN_HEIGHT;
  return Math.max(
    CHAT_COMPOSER_MIN_HEIGHT,
    Math.min(CHAT_COMPOSER_MAX_HEIGHT, Math.ceil(height))
  );
}

export function composerShouldScroll(height: number): boolean {
  return clampComposerHeight(height) >= CHAT_COMPOSER_MAX_HEIGHT;
}
