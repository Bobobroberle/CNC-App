/**
 * File upload to FluidNC over HTTP (WebUI/WebUIServer.cpp: `/upload` for the
 * SD card, `/files` for the local flash file system).
 *
 * FluidNC sends no CORS headers, so a page from another origin (file://, the
 * companion computer) cannot read the response. The upload is therefore sent
 * as an opaque `no-cors` request and checked afterwards over the WebSocket
 * (`$SD/List`). Everything else – listing, reading, running – goes over the
 * WebSocket, too.
 */
export const UPLOAD_ENDPOINTS = {
  sd: '/upload',
  localfs: '/files',
} as const;

export type FileSystem = keyof typeof UPLOAD_ENDPOINTS;

export type FetchLike = (
  input: string,
  init: { method: string; body: FormData; mode: 'no-cors' },
) => Promise<unknown>;

export interface HttpOptions {
  /** e.g. http://192.168.1.50 */
  baseUrl: string;
  fetch?: FetchLike;
}

/** The HTTP base URL belonging to a WebSocket URL such as ws://host:81/. */
export function httpBaseFromWebSocket(wsUrl: string): string {
  const url = new URL(wsUrl);
  return `http://${url.hostname}`;
}

export class FluidNCHttp {
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;

  constructor(options: HttpOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.fetchImpl = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
  }

  /**
   * Uploads a file in the WebUI's multipart format: directory in `path`, the
   * full name as file name and its size in `<name>S` for the free-space check.
   * Resolves when the request was sent; the result is not readable (see above).
   */
  async upload(fs: FileSystem, dir: string, name: string, content: Blob | string): Promise<void> {
    const blob =
      typeof content === 'string' ? new Blob([content], { type: 'text/plain' }) : content;
    const path = dir.endsWith('/') ? dir : `${dir}/`;
    const full = `${path}${name}`;
    const form = new FormData();
    form.append('path', path);
    form.append(`${full}S`, String(blob.size));
    form.append('myfile[]', blob, full);
    await this.fetchImpl(`${this.baseUrl}${UPLOAD_ENDPOINTS[fs]}`, {
      method: 'POST',
      body: form,
      mode: 'no-cors',
    });
  }
}
