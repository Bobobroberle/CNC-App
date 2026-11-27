import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { twoToolSign } from './toolsFixture';

/**
 * A whole program with two tools, kept as a file like the sign in `golden.test.ts`: any change to how tools are
 * changed or ordered shows up as a diff that can be read before it is accepted with
 * `pnpm --filter @lowrider/cam test -u`. It is the sign of that test, but with the text engraved by a V-bit.
 */
describe('golden program with two tools', () => {
  it('a sign: the holes with the mill, the text with the V-bit, then the slot and the outline with the mill', async () => {
    const { result, program, strokes } = twoToolSign();
    expect(result.problems).toEqual([]);
    expect(result.blocks!.map((b) => [b.number, b.operations])).toEqual([
      [1, 2],
      [2, strokes],
      [1, 2],
    ]);
    await expect(program).toMatchFileSnapshot(join(import.meta.dirname, 'golden', 'tools.nc'));
  });
});
