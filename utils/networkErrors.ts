/** Shared network/offline error detection for mobile API calls. */
export function isNetworkError(e: any): boolean {
  const status = e?.response?.status as number | undefined;
  if (status === 502 || status === 503 || status === 504 || status === 0) return true;
  if (!e?.response && e?.request) return true;
  if (e?.isOfflineGatewayError === true) return true;
  const msg = (e?.message ?? e?.response?.data?.message ?? '').toString().toLowerCase();
  return (
    msg.includes('network') ||
    msg.includes('err_network') ||
    msg.includes('econnrefused') ||
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    msg.includes('connection') ||
    msg.includes('failed to connect') ||
    e?.code === 'ERR_NETWORK' ||
    e?.code === 'ECONNREFUSED' ||
    e?.code === 'ECONNABORTED'
  );
}

export function isRateLimitError(error: unknown): boolean {
  const msg = ((error as any)?.message ?? '').toString().toLowerCase();
  return msg.includes('429') || msg.includes('rate limit');
}

/** User-facing copy for chat send failures — never expose raw axios/network errors. */
export function getChatNetworkErrorMessage(error: unknown, options?: { inline?: boolean }): string {
  const inline = options?.inline === true;
  if (isRateLimitError(error)) {
    return inline
      ? 'Rate limit exceeded. Please wait a moment before trying again.'
      : 'Rate limit exceeded. Please wait a moment before trying again.';
  }
  if (isNetworkError(error)) {
    return inline
      ? "We couldn't reach GrabDocs\n\nYour message wasn't sent. This may be due to a weak connection.\n\nPlease try again."
      : "Your message wasn't sent. This may be due to a weak connection.";
  }
  return inline
    ? "I'm experiencing technical difficulties. Please try again in a moment."
    : 'Failed to send message. Please try again.';
}
