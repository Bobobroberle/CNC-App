// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NumberField } from '../src/components/CorrectionPanel';
import { WorkshopSettingsCard } from '../src/components/WorkshopSettingsCard';
import { PLACE, FEED_MAX, safeHeightAllowed } from '../src/lib/stateSync';
import { LOWRIDER_V4_PROFILE } from '../src/lib/profile';
import { useJob } from '../src/store/job';
import { DEFAULT_SETTINGS, useWorkshop } from '../src/store/workshop';

// What a card takes, the Pi takes as well: a device that could enter a number that the Pi's documents
// refuse would be cut off from the Pi without knowing why. The ranges are the ones of `insane`.

// jsdom has no observers; the segmented control of the card wants them
class Quiet {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', Quiet);

afterEach(cleanup);

describe('a number field with a limit', () => {
  it('takes what is above its minimum and up to its maximum – and nothing else', () => {
    const onChange = vi.fn();
    render(<NumberField label="Spanne" value={null} onChange={onChange} max={PLACE} />);
    const input = screen.getByLabelText('Spanne');
    for (const text of ['180', '10000', '0,5'])
      fireEvent.change(input, { target: { value: text } });
    expect(onChange.mock.calls.map((c) => c[0])).toEqual([180, 10_000, 0.5]);
    onChange.mockClear();
    for (const text of ['10001', '1e9', '0', '-5', 'x', '']) {
      fireEvent.change(input, { target: { value: text } });
    }
    expect(onChange).not.toHaveBeenCalled();
  });

  it('has no upper limit unless it is given one', () => {
    const onChange = vi.fn();
    render(<NumberField label="Weit" value={null} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Weit'), { target: { value: '123456' } });
    expect(onChange).toHaveBeenCalledWith(123_456);
  });
});

describe('the safe height', () => {
  it('lies in the upper half of the Z travel where that is known, and nowhere absurd where it is not', () => {
    const z = { min: -120, max: 0 };
    expect(safeHeightAllowed(-5, z)).toBe(true);
    expect(safeHeightAllowed(-60, z)).toBe(true);
    expect(safeHeightAllowed(-61, z)).toBe(false);
    expect(safeHeightAllowed(1, z)).toBe(false);
    expect(safeHeightAllowed(-290)).toBe(true);
    expect(safeHeightAllowed(1e9)).toBe(false);
    expect(safeHeightAllowed(Number.NaN)).toBe(false);
  });
});

describe('the workshop card', () => {
  beforeEach(() => {
    useWorkshop.setState({ settings: { ...DEFAULT_SETTINGS } });
    useJob.setState({ profile: LOWRIDER_V4_PROFILE });
  });

  const fill = (label: string, value: string) =>
    fireEvent.change(screen.getByLabelText(new RegExp(label)), { target: { value } });
  const applyButton = () => screen.getByRole('button', { name: 'Übernehmen' }) as HTMLButtonElement;

  it('offers to apply what the Pi would take, and not what it would refuse', () => {
    render(<WorkshopSettingsCard />);
    expect(applyButton().disabled).toBe(false);
    // the placeholder travel is Z −297 … 3: the upper half ends at −147
    fill('Sichere Höhe', '-290');
    expect(applyButton().disabled).toBe(true);
    fill('Sichere Höhe', '-5');
    expect(applyButton().disabled).toBe(false);
    fill('Sichere Höhe', '');
    expect(applyButton().disabled).toBe(false);
    fill('Max. Fräsvorschub', String(FEED_MAX + 1));
    expect(applyButton().disabled).toBe(true);
    fill('Max. Fräsvorschub', String(FEED_MAX));
    expect(applyButton().disabled).toBe(false);
  });

  it('takes the tool change place only where it is a place of a table', () => {
    render(<WorkshopSettingsCard />);
    const x = screen.getAllByLabelText('X')[0]!;
    const y = screen.getAllByLabelText('Y')[0]!;
    fireEvent.change(x, { target: { value: '100' } });
    fireEvent.change(y, { target: { value: '200' } });
    expect(applyButton().disabled).toBe(false);
    fireEvent.change(x, { target: { value: String(PLACE + 1) } });
    expect(applyButton().disabled).toBe(true);
  });
});
