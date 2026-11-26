import { afterEach, describe, expect, it } from 'vitest';
import { blurAtSpeed, MIN_LAG_SPEED } from '../src/lib/strips';

// The store reads the machine profile of the job store (the stock LowRider: 50 mm/s jog) and the exposure of this device.
async function photoMap() {
  return import('../src/store/photomap');
}

afterEach(async () => {
  (await photoMap()).usePhotoMap.getState().setExposure(0);
});

describe("the speed of a run and the camera's exposure", () => {
  it('is what the tempo asks for while the exposure is not known (0): no cap, as before it could be told', async () => {
    const { stripSpeed, tempoSpeed, usePhotoMap } = await photoMap();
    expect(usePhotoMap.getState().exposureMs).toBe(0);
    for (const tempo of ['gentle', 'normal', 'fast'] as const)
      expect(stripSpeed(tempo)).toBe(tempoSpeed(tempo));
    expect(tempoSpeed('gentle')).toBeLessThan(tempoSpeed('normal'));
    expect(tempoSpeed('normal')).toBeLessThan(tempoSpeed('fast'));
  });

  it('is held to the speed at which a picture is blurred by no more than 0.3 mm, where the exposure is known', async () => {
    const { stripSpeed, tempoSpeed, usePhotoMap } = await photoMap();
    usePhotoMap.getState().setExposure(20);
    // 0.3 mm in 20 ms is 15 mm/s – below what "Normal" and "Fast" ask for, so it is the cap; "Sanft" asks for less
    expect(tempoSpeed('normal')).toBeGreaterThan(15);
    expect(stripSpeed('normal')).toBeCloseTo(15, 9);
    expect(stripSpeed('fast')).toBeCloseTo(15, 9);
    expect(blurAtSpeed(20, stripSpeed('normal'))).toBeCloseTo(0.3, 9);
    // a short exposure holds nothing back
    usePhotoMap.getState().setExposure(1);
    expect(stripSpeed('normal')).toBe(tempoSpeed('normal'));
  });

  it('may take a run below what the lag can be measured at – which `scanArea` then does not run – but never to a standstill', async () => {
    const { stripSpeed, usePhotoMap } = await photoMap();
    usePhotoMap.getState().setExposure(100);
    expect(stripSpeed('normal')).toBeCloseTo(3, 9);
    expect(stripSpeed('normal')).toBeLessThan(MIN_LAG_SPEED);
    // the exposure the field takes is at most a second: 0.3 mm in a second is slower than a crawl, held at 1 mm/s
    usePhotoMap.getState().setExposure(1e9);
    expect(usePhotoMap.getState().exposureMs).toBe(1000);
    expect(stripSpeed('normal')).toBe(1);
  });

  it('takes nothing for an exposure that is no number of milliseconds', async () => {
    const { usePhotoMap } = await photoMap();
    for (const bad of [-5, NaN, Infinity, 0]) {
      usePhotoMap.getState().setExposure(20);
      usePhotoMap.getState().setExposure(bad);
      expect(usePhotoMap.getState().exposureMs).toBe(0);
    }
  });
});
