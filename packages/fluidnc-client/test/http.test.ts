import { describe, expect, it, vi } from 'vitest';
import { FluidNCHttp, httpBaseFromWebSocket, type FetchLike } from '../src';

describe('FluidNCHttp', () => {
  it('uploads in the WebUI multipart format as an opaque request', async () => {
    const fetch = vi.fn<FetchLike>(async () => undefined);
    const http = new FluidNCHttp({ baseUrl: 'http://jackpot/', fetch });
    await http.upload('sd', '/jobs', 'a.nc', 'G0 X1\n');
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe('http://jackpot/upload');
    expect(init).toMatchObject({ method: 'POST', mode: 'no-cors' });
    expect(init.body.get('path')).toBe('/jobs/');
    expect(init.body.get('/jobs/a.ncS')).toBe('6');
    expect((init.body.get('myfile[]') as File).name).toBe('/jobs/a.nc');
    await http.upload('localfs', '/', 'config.yaml', new Blob(['x']));
    expect(fetch.mock.calls[1]![0]).toBe('http://jackpot/files');
  });

  it('uses the global fetch by default', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null));
    await new FluidNCHttp({ baseUrl: 'http://jackpot' }).upload('sd', '/', 'x.nc', 'G0');
    expect(spy).toHaveBeenCalledWith(
      'http://jackpot/upload',
      expect.objectContaining({ mode: 'no-cors' }),
    );
    spy.mockRestore();
  });

  it('derives the HTTP address from the WebSocket URL', () => {
    expect(httpBaseFromWebSocket('ws://192.168.178.40:81/')).toBe('http://192.168.178.40');
  });
});
