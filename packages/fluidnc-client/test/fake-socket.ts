import type { WebSocketLike } from '../src';

/** In-memory WebSocket double that records what the client sends. */
export class FakeSocket implements WebSocketLike {
  binaryType = 'blob';
  readyState = 0;
  sent: (string | Uint8Array)[] = [];
  onopen: ((event: unknown) => void) | null = null;
  onclose: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;

  constructor(readonly url: string) {}

  open() {
    this.readyState = 1;
    this.onopen?.({});
  }

  send(data: string | Uint8Array) {
    this.sent.push(data);
  }

  /** Opens and lets the controller answer the first status query. */
  answer() {
    this.open();
    this.receive('<Idle|MPos:0.000,0.000,0.000|FS:0,0>\n');
  }

  close(code?: number, reason?: string) {
    this.readyState = 3;
    this.onclose?.(code === undefined ? {} : { code, reason });
  }

  fail() {
    this.onerror?.({});
  }

  /** Controller output as a binary frame. */
  receive(text: string) {
    this.onmessage?.({ data: new TextEncoder().encode(text).buffer });
  }

  receiveText(text: string) {
    this.onmessage?.({ data: text });
  }

  /** Lines sent as text frames, without newline. */
  get sentLines(): string[] {
    return this.sent
      .filter((d): d is string => typeof d === 'string' && d.endsWith('\n'))
      .map((d) => d.slice(0, -1));
  }
}
