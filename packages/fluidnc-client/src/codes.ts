/**
 * Alarm and error identifiers. Numbers follow FluidNC's `Alarm.h` and
 * `Error.h` (main branch, checked 2026-10). The UI maps the identifiers to
 * plain-language text and a suggested next step.
 */
export const ALARM_CODES: Record<number, string> = {
  1: 'HardLimit',
  2: 'SoftLimit',
  3: 'AbortCycle',
  4: 'ProbeFailInitial',
  5: 'ProbeFailContact',
  6: 'HomingFailReset',
  7: 'HomingFailDoor',
  8: 'HomingFailPulloff',
  9: 'HomingFailApproach',
  10: 'SpindleControl',
  11: 'StartupPin',
  12: 'HomingAmbiguousSwitch',
  13: 'HardStop',
  14: 'Unhomed',
  15: 'Init',
  16: 'ExpanderReset',
  17: 'GCodeError',
  18: 'ProbeHardLimit',
};

export const ERROR_CODES: Record<number, string> = {
  1: 'ExpectedCommandLetter',
  2: 'BadNumberFormat',
  3: 'InvalidStatement',
  4: 'NegativeValue',
  5: 'SettingDisabled',
  6: 'SettingStepPulseMin',
  7: 'SettingReadFail',
  8: 'IdleError',
  9: 'SystemGcLock',
  10: 'SoftLimitError',
  11: 'Overflow',
  12: 'MaxStepRateExceeded',
  13: 'CheckDoor',
  14: 'LineLengthExceeded',
  15: 'TravelExceeded',
  16: 'InvalidJogCommand',
  17: 'SettingDisabledLaser',
  18: 'HomingNoCycles',
  20: 'GcodeUnsupportedCommand',
  21: 'GcodeModalGroupViolation',
  22: 'GcodeUndefinedFeedRate',
  23: 'GcodeCommandValueNotInteger',
  24: 'GcodeAxisCommandConflict',
  25: 'GcodeWordRepeated',
  26: 'GcodeNoAxisWords',
  27: 'GcodeInvalidLineNumber',
  28: 'GcodeValueWordMissing',
  29: 'GcodeUnsupportedCoordSys',
  30: 'GcodeG53InvalidMotionMode',
  31: 'GcodeAxisWordsExist',
  32: 'GcodeNoAxisWordsInPlane',
  33: 'GcodeInvalidTarget',
  34: 'GcodeArcRadiusError',
  35: 'GcodeNoOffsetsInPlane',
  36: 'GcodeUnusedWords',
  37: 'GcodeG43DynamicAxisError',
  38: 'GcodeMaxValueExceeded',
  39: 'PParamMaxExceeded',
  130: 'JogCancelled',
};

export function alarmName(code: number): string {
  return ALARM_CODES[code] ?? 'Unknown';
}

export function errorName(code: number): string {
  return ERROR_CODES[code] ?? 'Unknown';
}
