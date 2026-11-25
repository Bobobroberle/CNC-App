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
  19: 'SingleAxisHoming',
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
  40: 'CheckStartupPins',
  // The file system (the SD card and the flash): `Error.h`, read from the main branch of FluidNC on 2026-11-25
  60: 'FsFailedMount',
  61: 'FsFailedRead',
  62: 'FsFailedOpenDir',
  63: 'FsDirNotFound',
  64: 'FsFileEmpty',
  65: 'FsFileNotFound',
  66: 'FsFailedOpenFile',
  67: 'FsFailedBusy',
  68: 'FsFailedDelDir',
  69: 'FsFailedDelFile',
  70: 'FsFailedRenameFile',
  80: 'NumberRange',
  81: 'InvalidValue',
  82: 'FsFailedCreateFile',
  83: 'FsFailedFormat',
  90: 'MessageFailed',
  100: 'NvsSetFailed',
  101: 'NvsGetStatsFailed',
  110: 'AuthenticationFailed',
  120: 'AnotherInterfaceBusy',
  130: 'JogCancelled',
  150: 'BadPinSpecification',
  151: 'BadRuntimeConfigSetting',
  152: 'ConfigurationInvalid',
  160: 'UploadFailed',
  161: 'DownloadFailed',
  162: 'ReadOnlySetting',
  170: 'ExpressionDivideByZero',
  171: 'ExpressionInvalidArgument',
  172: 'ExpressionInvalidResult',
  173: 'ExpressionUnknownOp',
  174: 'ExpressionArgumentOutOfRange',
  175: 'ExpressionSyntaxError',
  176: 'FlowControlSyntaxError',
  177: 'FlowControlNotExecutingMacro',
  178: 'FlowControlOutOfMemory',
  179: 'FlowControlStackOverflow',
  180: 'ParameterAssignmentFailed',
  181: 'GcodeValueWordInvalid',
  182: 'GcodeNoSavedModalState',
};

/**
 * Whether an error code is about the controller's file system – the SD card or the flash – and not about the
 * line that was sent: the line was fine, the card (or the file) was not.
 */
export function isFileSystemError(code: number): boolean {
  return (code >= 60 && code <= 70) || code === 82 || code === 83;
}

export function alarmName(code: number): string {
  return ALARM_CODES[code] ?? 'Unknown';
}

export function errorName(code: number): string {
  return ERROR_CODES[code] ?? 'Unknown';
}
