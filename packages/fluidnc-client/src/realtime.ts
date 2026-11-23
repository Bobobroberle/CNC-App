/** Single-byte realtime commands, executed immediately by FluidNC. */
export const Realtime = {
  StatusReport: 0x3f, // '?'
  CycleStart: 0x7e, // '~'
  FeedHold: 0x21, // '!'
  SoftReset: 0x18, // Ctrl-X
  SafetyDoor: 0x84,
  JogCancel: 0x85,
  FeedOverrideReset: 0x90,
  FeedOverridePlus10: 0x91,
  FeedOverrideMinus10: 0x92,
  FeedOverridePlus1: 0x93,
  FeedOverrideMinus1: 0x94,
  RapidOverrideReset: 0x95,
  RapidOverrideMedium: 0x96,
  RapidOverrideLow: 0x97,
  SpindleOverrideReset: 0x99,
  SpindleOverridePlus10: 0x9a,
  SpindleOverrideMinus10: 0x9b,
  SpindleOverridePlus1: 0x9c,
  SpindleOverrideMinus1: 0x9d,
  SpindleStop: 0x9e,
  FloodToggle: 0xa0,
  MistToggle: 0xa1,
} as const;

export type RealtimeCommand = (typeof Realtime)[keyof typeof Realtime];

export const OVERRIDE_MIN = 10;
export const OVERRIDE_MAX = 200;

/**
 * Bytes that move the feed or spindle override from `current` to `target`
 * percent (clamped to 10…200 %), using reset and ±10/±1 steps.
 */
export function overrideBytes(kind: 'feed' | 'spindle', current: number, target: number): number[] {
  const goal = Math.round(Math.min(OVERRIDE_MAX, Math.max(OVERRIDE_MIN, target)));
  const r = Realtime;
  const [reset, plus10, minus10, plus1, minus1] =
    kind === 'feed'
      ? [
          r.FeedOverrideReset,
          r.FeedOverridePlus10,
          r.FeedOverrideMinus10,
          r.FeedOverridePlus1,
          r.FeedOverrideMinus1,
        ]
      : [
          r.SpindleOverrideReset,
          r.SpindleOverridePlus10,
          r.SpindleOverrideMinus10,
          r.SpindleOverridePlus1,
          r.SpindleOverrideMinus1,
        ];
  const bytes: number[] = [];
  let value = Math.round(current);
  // Starting from 100 % is shorter when the current value is far away.
  if (Math.abs(goal - 100) < Math.abs(goal - value)) {
    bytes.push(reset);
    value = 100;
  }
  while (goal - value >= 10) {
    bytes.push(plus10);
    value += 10;
  }
  while (value - goal >= 10) {
    bytes.push(minus10);
    value -= 10;
  }
  while (value < goal) {
    bytes.push(plus1);
    value += 1;
  }
  while (value > goal) {
    bytes.push(minus1);
    value -= 1;
  }
  return bytes;
}

/** Rapid override only knows 100, 50 and 25 %. */
export function rapidOverrideByte(percent: 25 | 50 | 100): number {
  return percent === 100
    ? Realtime.RapidOverrideReset
    : percent === 50
      ? Realtime.RapidOverrideMedium
      : Realtime.RapidOverrideLow;
}
