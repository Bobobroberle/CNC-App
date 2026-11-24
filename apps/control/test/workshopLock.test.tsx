// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WorkshopSettingsCard } from '../src/components/WorkshopSettingsCard';
import { t } from '../src/i18n';
import { useMachine } from '../src/store/machine';
import '../src/store/underway';
import { useWorkshop } from '../src/store/workshop';

// A job under way drives to the tool change place itself: neither the jog panel's card nor this one
// changes it meanwhile (the other settings of the card stay editable).
describe('the tool change place in the workshop settings', () => {
  beforeEach(() => {
    // the segmented control measures itself: jsdom has no ResizeObserver
    globalThis.ResizeObserver ??= class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    useMachine.setState({ fileJob: null, stream: null, lostInJob: null, status: null });
    useWorkshop.getState().setSettings({ toolChangePosition: { x: 10, y: 20 } });
  });
  afterEach(() => {
    cleanup();
    useMachine.setState({ fileJob: null });
    useWorkshop.getState().setSettings({ toolChangePosition: null });
  });

  const apply = () => fireEvent.click(screen.getByRole('button', { name: t('machine.apply') }));

  it('is changed from here while no job is under way', () => {
    render(<WorkshopSettingsCard />);
    const x = screen.getByLabelText(t('workshop.changeX')) as HTMLInputElement;
    expect(x.disabled).toBe(false);
    fireEvent.change(x, { target: { value: '55' } });
    apply();
    expect(useWorkshop.getState().settings.toolChangePosition).toEqual({ x: 55, y: 20 });
  });

  it('stays as it is under a job: the fields and buttons are locked and applying keeps it', () => {
    useMachine.setState({ fileJob: { name: 'x.nc', startedAt: 0 } });
    render(<WorkshopSettingsCard />);
    expect((screen.getByLabelText(t('workshop.changeX')) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText(t('workshop.changeY')) as HTMLInputElement).disabled).toBe(true);
    for (const name of [t('workshop.here'), t('workshop.noChangePosition')]) {
      expect((screen.getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(true);
    }
    expect(screen.queryByText(t('jog.change.locked'))).not.toBeNull();
    // the rest of the card is still the operator's: the spindle range is applied, the place is not
    fireEvent.change(screen.getByLabelText(t('workshop.rpmMax')), { target: { value: '24000' } });
    apply();
    expect(useWorkshop.getState().settings.spindle.rpmMax).toBe(24000);
    expect(useWorkshop.getState().settings.toolChangePosition).toEqual({ x: 10, y: 20 });
    useWorkshop
      .getState()
      .setSettings({ spindle: { rpmMin: 10000, rpmMax: 30000, maxFeed: 3000 } });
  });
});
