/**
 * Link security utilities for mobile chat.
 * Mirrors web linkSecurity.tsx: validateAndSanitizeUrl, SafeLink behavior.
 */

export interface UrlValidationResult {
  valid: boolean;
  url?: string;
  error?: string;
}

/** Blocked URL schemes (javascript:, data:, file:, vbscript:, etc.) */
const BLOCKED_SCHEMES = /^(javascript|data|file|vbscript|blob):/i;

/** Private/local IP patterns */
const PRIVATE_IP =
  /^(?:10\.|172\.(?:1[6-9]|2\d|3[01])\.|192\.168\.|127\.|localhost|0\.0\.0\.0|::1)/i;

/**
 * Validate and sanitize a URL for safe opening.
 * Blocks: javascript:, data:, file:, private IPs, invalid protocols.
 */
export function validateAndSanitizeUrl(
  raw: string | null | undefined
): UrlValidationResult {
  if (!raw || typeof raw !== 'string') {
    return { valid: false, error: 'Invalid URL' };
  }
  const trimmed = raw.trim();
  if (!trimmed) return { valid: false, error: 'Empty URL' };

  try {
    // Ensure protocol for bare hostnames
    let toParse = trimmed;
    if (!/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
      toParse = 'https://' + trimmed;
    }

    const url = new URL(toParse);

    if (BLOCKED_SCHEMES.test(url.protocol)) {
      return { valid: false, error: 'Blocked URL scheme' };
    }

    const host = url.hostname || '';
    if (PRIVATE_IP.test(host)) {
      return { valid: false, error: 'Private/local URLs not allowed' };
    }

    // Only allow http and https
    const protocol = url.protocol.toLowerCase();
    if (protocol !== 'http:' && protocol !== 'https:') {
      return { valid: false, error: 'Only http and https URLs are allowed' };
    }

    return { valid: true, url: url.href };
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }
}
