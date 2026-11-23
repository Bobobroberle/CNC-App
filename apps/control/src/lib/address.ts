/** FluidNC with WebUI v2 serves its WebSocket on port 81. */
export const DEFAULT_WS_PORT = 81;

/**
 * Turns what the operator types (an IP, a host name, host:port or a full
 * ws:// URL) into a WebSocket URL. Returns null for empty input.
 */
export function toWebSocketUrl(input: string): string | null {
  const text = input.trim();
  if (text === '') return null;
  if (/^wss?:\/\//i.test(text)) return text;
  const host = text.replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
  const hasPort = /:\d+$/.test(host);
  return `ws://${host}${hasPort ? '' : `:${DEFAULT_WS_PORT}`}/`;
}
