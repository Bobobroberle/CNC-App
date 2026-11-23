import { describe, expect, it } from 'vitest';
import { hasKey } from '../src/i18n';
import { machineReason, reasonPlace } from '../src/lib/reason';

describe('why a control cannot be used (DESIGN.md §6.2)', () => {
  it('names what the machine has against it, most basic first', () => {
    expect(machineReason('disconnected', undefined)).toBe('jog.reason.offline');
    expect(machineReason('connecting', undefined)).toBe('reason.connecting');
    expect(machineReason('connected', undefined)).toBe('reason.connecting');
    expect(machineReason('connected', null)).toBe('reason.connecting');
    expect(machineReason('connected', 'Alarm')).toBe('reason.alarm');
    expect(machineReason('connected', 'Hold:0')).toBe('reason.hold');
    expect(machineReason('connected', 'Run')).toBe('jog.reason.busy');
    expect(machineReason('connected', 'Jog')).toBe('jog.reason.busy');
    expect(machineReason('connected', 'Home')).toBe('jog.reason.busy');
    // At rest the machine has nothing against it: the reason lies elsewhere.
    expect(machineReason('connected', 'Idle')).toBeNull();
  });

  it('has every reason in the dictionary', () => {
    for (const key of [
      'jog.reason.offline',
      'jog.reason.busy',
      'reason.connecting',
      'reason.alarm',
      'reason.hold',
      'reason.missing',
    ]) {
      expect(hasKey(key), key).toBe(true);
    }
  });

  it('puts the hint above the control, below where there is no room, never off the page', () => {
    const page = { width: 800, height: 600 };
    const size = { width: 200, height: 40 };
    // Above, centred.
    expect(reasonPlace({ left: 300, right: 500, top: 300, bottom: 348 }, size, page)).toEqual({
      left: 300,
      top: 252,
    });
    // No room above: below.
    expect(reasonPlace({ left: 300, right: 500, top: 20, bottom: 68 }, size, page)).toEqual({
      left: 300,
      top: 76,
    });
    // At the right and left edges it stays inside.
    expect(reasonPlace({ left: 740, right: 796, top: 300, bottom: 348 }, size, page).left).toBe(
      592,
    );
    expect(reasonPlace({ left: 0, right: 48, top: 300, bottom: 348 }, size, page).left).toBe(8);
    // A control as tall as the page: the hint stays on it rather than leaving the page.
    const tall = reasonPlace({ left: 0, right: 800, top: 0, bottom: 600 }, size, page);
    expect(tall.top).toBeGreaterThanOrEqual(8);
    expect(tall.top + size.height).toBeLessThanOrEqual(page.height);
  });
});
