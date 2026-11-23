import { describe, expect, it } from 'vitest';
import { parseFileList, safeFileName, settingCommand } from '../src';

describe('parseFileList', () => {
  it('reads top-level files of $SD/List', () => {
    expect(
      parseFileList([
        '[FILE: 1003_T1.nc|SIZE:905722]',
        '[DIR:jobs]',
        '[FILE:  nested.nc|SIZE:10]',
        '[/sd Free:1.2GB Used:3MB Total:1.2GB]',
        'ok',
      ]),
    ).toEqual([{ name: '1003_T1.nc', size: 905722 }]);
  });
});

describe('safeFileName', () => {
  it('replaces characters that break $SD/Run', () => {
    expect(safeFileName('Schaftfräser Teil 1.nc')).toBe('Schaftfraser_Teil_1.nc');
    expect(safeFileName('  ')).toBe('job.nc');
  });
});

describe('settingCommand', () => {
  it('builds runtime config commands and rejects bad paths', () => {
    expect(settingCommand('axes/x/soft_limits', true)).toBe('$/axes/x/soft_limits=true');
    expect(settingCommand('axes/z/max_travel_mm', 95)).toBe('$/axes/z/max_travel_mm=95');
    expect(() => settingCommand('axes/x=1\n$H', 1)).toThrow(/invalid/i);
  });
});
