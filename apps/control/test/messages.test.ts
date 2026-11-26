import { describe, expect, it } from 'vitest';
import { hasKey } from '../src/i18n';
import {
  acknowledge,
  acknowledgeWarnings,
  ALARM_LOG_KEY,
  countByLevel,
  ERROR_LOG_KEY,
  filterMessages,
  groupOf,
  levelOfLog,
  LEVELS,
  needsAttention,
  openLevel,
  resolveFaults,
  TOAST_MS,
  validMessages,
  withMessage,
  type Level,
  errorClass,
  sdListNeedsWarning,
  validContext,
  type Message,
  type MessageGroup,
} from '../src/lib/messages';
import { AXIS_TEST_DISTANCES, axisTestResult, hoursMinutes, runTime } from '../src/lib/service';

let id = 0;
const message = (level: Level, extra: Partial<Message> = {}): Message => ({
  id: (id += 1),
  at: 1_700_000_000_000 + id,
  level,
  title: `${level} ${id}`,
  cause: 'cause',
  effect: 'effect',
  action: 'action',
  acknowledged: false,
  resolved: false,
  ...extra,
});

describe('the five levels (DESIGN.md §6.3)', () => {
  it('are five, most urgent first', () => {
    expect([...LEVELS]).toEqual(['critical', 'fault', 'warning', 'hint', 'info']);
  });

  it('an information is a toast that goes, a hint has none, warnings and faults show and stay', () => {
    expect(TOAST_MS.info).toBeGreaterThan(0);
    expect(TOAST_MS.hint).toBe(0);
    expect(TOAST_MS.warning).toBeGreaterThan(TOAST_MS.info);
    expect(TOAST_MS.fault).toBeGreaterThan(0);
    // The critical message is no toast: it has the whole work area.
    expect(TOAST_MS.critical).toBe(0);
  });

  it('asks for the operator: a warning until acknowledged, a fault until its cause is gone', () => {
    expect(needsAttention(message('warning'))).toBe(true);
    expect(needsAttention(message('warning', { acknowledged: true }))).toBe(false);
    expect(needsAttention(message('critical'))).toBe(true);
    expect(needsAttention(message('critical', { acknowledged: true }))).toBe(false);
    expect(needsAttention(message('fault'))).toBe(true);
    // A fault cannot be acknowledged away.
    expect(needsAttention(message('fault', { acknowledged: true }))).toBe(true);
    expect(needsAttention(message('fault', { resolved: true }))).toBe(false);
    expect(needsAttention(message('hint'))).toBe(false);
    expect(needsAttention(message('info'))).toBe(false);
  });

  it('names the most urgent level that is open', () => {
    expect(openLevel([])).toBeNull();
    expect(openLevel([message('info'), message('hint')])).toBeNull();
    expect(openLevel([message('warning'), message('info')])).toBe('warning');
    expect(openLevel([message('warning'), message('fault')])).toBe('fault');
    expect(openLevel([message('fault', { resolved: true }), message('warning')])).toBe('warning');
    expect(openLevel([message('critical'), message('fault')])).toBe('critical');
  });
});

describe('what a line of the log becomes', () => {
  it('makes every error line a warning – but for the line of an alarm, which is the fault itself', () => {
    expect(levelOfLog('error', 'files.uploadFailed')).toBe('warning');
    expect(levelOfLog('error', undefined)).toBe('warning');
    expect(levelOfLog('error', ERROR_LOG_KEY)).toBe('warning');
    expect(levelOfLog('error', ALARM_LOG_KEY)).toBeNull();
  });

  it('keeps most info lines for the log; a few are an information or a hint', () => {
    expect(levelOfLog('info', undefined)).toBeNull();
    expect(levelOfLog('info', 'wcs.selected')).toBeNull();
    expect(levelOfLog('info', 'drive.homed')).toBe('info');
    expect(levelOfLog('info', 'files.finished')).toBe('info');
    expect(levelOfLog('info', 'drive.limited')).toBe('hint');
    expect(levelOfLog('info', 'goto.limited')).toBe('hint');
    expect(levelOfLog('in', 'drive.homed')).toBeNull();
    expect(levelOfLog('out', undefined)).toBeNull();
  });

  it('reads the group from the key, with a few that say otherwise', () => {
    const cases: [string | undefined, MessageGroup][] = [
      [undefined, 'general'],
      ['something.else', 'general'],
      ['machine.connectFailed', 'connection'],
      ['machine.configInvalid', 'config'],
      ['photomap.notConnected', 'connection'],
      // a move that was not carried out is about moving, not about the picture
      ['photomap.scanFailed', 'motion'],
      ['calibration.moveFailed', 'motion'],
      // the reasons themselves stay with the measuring
      ['calibration.noRoom', 'camera'],
      ['calibration.outside', 'camera'],
      ['companion.offline', 'companion'],
      ['files.ended', 'sd'],
      ['stream.aborted', 'stream'],
      ['frame.failed', 'motion'],
      ['probe.failed', 'probe'],
      ['probeWizard.failed', 'probe'],
      ['calibration.noMarker', 'camera'],
      ['firmware.failed', 'config'],
      ['job.loadError', 'file'],
      ['series.log.measureFailed', 'flow'],
      ['drive.limited', 'limit'],
      ['drive.homed', 'done'],
      ['files.finished', 'done'],
    ];
    for (const [key, group] of cases) expect(groupOf(key), String(key)).toBe(group);
  });

  it('has cause, effect and next step for every group, in the dictionary', () => {
    const groups: MessageGroup[] = [
      'linkPi',
      'linkRelay',
      'linkDirect',
      'connection',
      'companion',
      'sd',
      'stream',
      'motion',
      'probe',
      'camera',
      'config',
      'file',
      'flow',
      'limit',
      'jobLocked',
      'scanTiming',
      'sync',
      'done',
      'general',
    ];
    for (const group of groups) {
      for (const part of ['cause', 'effect', 'action']) {
        expect(hasKey(`messages.groups.${group}.${part}`), `${group}.${part}`).toBe(true);
      }
    }
    for (const level of LEVELS) expect(hasKey(`messages.levels.${level}`)).toBe(true);
  });

  it('puts a refused change of the program in its own group, whose next step is not "repeat"', () => {
    expect(groupOf('job.locked')).toBe('jobLocked');
    // pictures taken while the camera's picture still changed: a warning about the map, not about the camera's measuring
    expect(groupOf('photomap.restUnsure')).toBe('scanTiming');
    expect(levelOfLog('error', 'photomap.restUnsure')).toBe('warning');
    // a step jog dropped for want of a machine at rest: advice that stays in the centre, nothing blocked
    expect(levelOfLog('info', 'drive.notAtRest')).toBe('hint');
    expect(groupOf('drive.notAtRest')).toBe('general');
    expect(groupOf('job.loadError')).toBe('file');
  });
});

describe('what a rejected command is about', () => {
  it('is the card where it cannot be mounted or opened, one file for the rest of the file system, the line for the rest', () => {
    // listing the card fails at mounting it (60); 62 is raised when a directory is made, not when the card is listed
    expect(errorClass(60)).toBe('card');
    // the rest happens to one file – on the card or in the controller's flash, which the app uses too
    for (const code of [61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 82, 83]) {
      expect(errorClass(code), String(code)).toBe('file');
    }
    for (const code of [1, 20, 22, 59, 71, 80, 81, 100, 130, 999]) {
      expect(errorClass(code), String(code)).toBe('line');
    }
  });

  it('has a text for every error the controller can say about its file system', () => {
    for (const name of [
      'FsFailedMount',
      'FsFailedRead',
      'FsFailedOpenDir',
      'FsDirNotFound',
      'FsFileEmpty',
      'FsFileNotFound',
      'FsFailedOpenFile',
      'FsFailedBusy',
      'FsFailedDelDir',
      'FsFailedDelFile',
      'FsFailedRenameFile',
      'FsFailedCreateFile',
      'FsFailedFormat',
    ]) {
      expect(hasKey(`error.${name}`), name).toBe(true);
    }
    for (const part of ['title', 'effect', 'action']) {
      expect(hasKey(`messages.rejectedSd.${part}`), part).toBe(true);
      expect(hasKey(`messages.rejectedFile.${part}`), part).toBe(true);
    }
  });
});

describe('a failed listing of the SD card', () => {
  it('has no warning of its own where the controller said the card cannot be mounted – that one says it', () => {
    expect(sdListNeedsWarning(60)).toBe(false);
  });

  it('has one where there was no answer, or the answer names no card', () => {
    expect(sdListNeedsWarning(null)).toBe(true);
    // a file error does not say the list failed, a rejected line even less
    for (const code of [61, 62, 63, 65, 66, 67, 70, 82, 83, 9, 20, 8]) {
      expect(sdListNeedsWarning(code), String(code)).toBe(true);
    }
  });
});

describe('the surroundings kept with a message', () => {
  const good = {
    key: 'files.listFailed',
    facts: ['Zustand: Idle'],
    recent: ['15:21:03 > $SD/List'],
  };

  it('come back from storage when they are short lines of text – and are dropped when they are not', () => {
    expect(validContext(good)).toEqual(good);
    for (const bad of [
      null,
      undefined,
      'x',
      5,
      [],
      {},
      { facts: 'x', recent: [] },
      { facts: [], recent: [1] },
    ]) {
      expect(validContext(bad), JSON.stringify(bad)).toBeUndefined();
    }
    // the key is optional, and only text
    expect(validContext({ facts: [], recent: [] })).toEqual({ facts: [], recent: [] });
    expect(validContext({ key: 5, facts: [], recent: [] })).toEqual({ facts: [], recent: [] });
  });

  it('are kept small whatever storage holds: a few lines, each short', () => {
    const long = 'x'.repeat(5000);
    const kept = validContext({
      key: long,
      facts: Array.from({ length: 50 }, () => long),
      recent: Array.from({ length: 50 }, () => long),
    })!;
    expect(kept.facts).toHaveLength(8);
    expect(kept.recent).toHaveLength(6);
    expect(kept.key).toHaveLength(120);
    for (const l of [...kept.facts, ...kept.recent]) expect(l.length).toBeLessThanOrEqual(120);
  });

  it('do not keep an older message from loading – one without them, or with broken ones', () => {
    const base = {
      id: 1,
      at: 1,
      level: 'warning',
      title: 't',
      cause: 'c',
      effect: 'e',
      action: 'a',
    };
    const loaded = validMessages([
      base,
      { ...base, id: 2, context: good },
      { ...base, id: 3, context: { facts: 'broken', recent: [] } },
    ])!;
    expect(loaded.map((m) => m.id)).toEqual([1, 2, 3]);
    expect(loaded[0]).not.toHaveProperty('context');
    expect(loaded[1]!.context).toEqual(good);
    expect(loaded[2]).not.toHaveProperty('context');
  });
});

describe('the messages of the exchange with the Pi', () => {
  it('have a group of their own – and say the truth about what was changed', () => {
    for (const key of [
      'sync.refused',
      'sync.replacedLocal',
      'sync.replacedOther',
      'sync.applyFailed',
    ]) {
      expect(groupOf(key), key).toBe('sync');
      expect(levelOfLog('error', key), key).toBe('warning');
    }
    // information the operator is shown, and advice that stays in the centre
    expect(levelOfLog('info', 'sync.simulatorEnded')).toBe('info');
    expect(levelOfLog('info', 'sync.overwritten')).toBe('info');
    expect(levelOfLog('info', 'sync.rewound')).toBe('hint');
    expect(levelOfLog('info', 'sync.macrosFromPi')).toBe('hint');
    expect(groupOf('sync.rewound')).toBe('sync');
  });
});

describe('the list of messages', () => {
  it('filters by level and counts each; what is open comes first, the most urgent on top', () => {
    const list = [message('info'), message('warning'), message('fault'), message('warning')];
    const [info, first, fault, second] = list.map((m) => m.id);
    expect(filterMessages(list, 'all').map((m) => m.id)).toEqual([fault, second, first, info]);
    expect(filterMessages(list, 'warning').map((m) => m.id)).toEqual([second, first]);
    // Settled ones follow, newest first, whatever their level.
    const settled = [
      message('warning', { acknowledged: true }),
      message('fault', { resolved: true }),
      message('hint'),
      message('warning'),
    ];
    expect(filterMessages(settled, 'all').map((m) => m.id)).toEqual(
      [settled[3]!, settled[2]!, settled[1]!, settled[0]!].map((m) => m.id),
    );
    expect(filterMessages(list, 'critical')).toEqual([]);
    expect(countByLevel(list)).toEqual({
      all: 4,
      critical: 0,
      fault: 1,
      warning: 2,
      hint: 0,
      info: 1,
    });
  });

  it('acknowledges a warning or a critical message – never a fault', () => {
    const [warning, fault, critical] = [message('warning'), message('fault'), message('critical')];
    const list = [warning, fault, critical];
    expect(acknowledge(list, warning.id)[0]!.acknowledged).toBe(true);
    expect(acknowledge(list, critical.id)[2]!.acknowledged).toBe(true);
    expect(acknowledge(list, fault.id)[1]!.acknowledged).toBe(false);
    expect(acknowledge(list, 999_999)).toEqual(list);
  });

  it('acknowledges all warnings at once and leaves the critical one for where it shows', () => {
    const list = acknowledgeWarnings([message('warning'), message('critical'), message('fault')]);
    expect(list.map((m) => m.acknowledged)).toEqual([true, false, false]);
  });

  it('resolves the faults when their cause is gone', () => {
    const done = message('fault', { resolved: true });
    const list = resolveFaults([message('fault'), message('warning'), done]);
    expect(list.map((m) => m.resolved)).toEqual([true, false, true]);
    expect(list[2]).toBe(done);
  });

  it('drops the oldest settled message first when the list is full', () => {
    const [open, settled, hint] = [
      message('warning'),
      message('warning', { acknowledged: true }),
      message('hint'),
    ];
    const next = withMessage([open, settled, hint], message('info'), 3);
    expect(next.map((m) => m.id)).not.toContain(settled.id);
    expect(next.map((m) => m.id)).toContain(open.id);
    // Nothing but open ones: the oldest goes.
    const [a, b] = [message('warning'), message('fault')];
    const full = withMessage([a, b], message('fault'), 2);
    expect(full.map((m) => m.id)).toEqual([b.id, full[1]!.id]);
    expect(withMessage([a], b)).toEqual([a, b]);
  });

  it('takes back from storage only what is a message; old faults are history', () => {
    expect(validMessages('nonsense')).toBeNull();
    expect(validMessages(null)).toBeNull();
    const kept = validMessages([
      message('fault'),
      message('warning', { acknowledged: true }),
      { id: 'x' },
      null,
      { ...message('info'), level: 'loud' },
      { ...message('info'), cause: 7 },
    ])!;
    expect(kept).toHaveLength(2);
    expect(kept[0]!.resolved).toBe(true);
    expect(kept[1]!.acknowledged).toBe(true);
    expect(needsAttention(kept[0]!)).toBe(false);
  });
});

describe('Service & Diagnose', () => {
  it('compares what the controller reports with the test move', () => {
    expect([...AXIS_TEST_DISTANCES]).toEqual([1, 10, 50]);
    expect(axisTestResult(10, 100, 110)).toEqual({ expected: 10, reported: 10, ok: true });
    expect(axisTestResult(-10, 5, -4.99).ok).toBe(true);
    // Stopped at the limit after 3.2 mm.
    expect(axisTestResult(10, 1196.8, 1200)).toEqual({ expected: 10, reported: 3.2, ok: false });
    expect(axisTestResult(1, 0, 0).ok).toBe(false);
    // The wrong way.
    expect(axisTestResult(10, 0, -10).ok).toBe(false);
  });

  it('sums the running time of the recorded jobs – and says nothing without any', () => {
    expect(runTime([])).toBeNull();
    expect(runTime([{ duration: 0, startedAt: 5 }])).toBeNull();
    expect(
      runTime([
        { duration: 3600, startedAt: 2000 },
        { duration: 1830, startedAt: 1000 },
        { duration: Number.NaN, startedAt: 10 },
      ]),
    ).toEqual({ seconds: 5430, jobs: 2, since: 1000 });
    expect(hoursMinutes(5430)).toEqual({ hours: 1, minutes: 31 });
    expect(hoursMinutes(59)).toEqual({ hours: 0, minutes: 1 });
    expect(hoursMinutes(0)).toEqual({ hours: 0, minutes: 0 });
  });
});
