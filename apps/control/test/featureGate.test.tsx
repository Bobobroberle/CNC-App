// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Feature } from '../src/components/Feature';
import { FeaturesCard } from '../src/components/FeaturesCard';
import { t } from '../src/i18n';
import { useWorkshop } from '../src/store/workshop';

// What the job's readiness list says is the sign that a flow is under way: the card of a hidden
// function must show while it is, or a locked start would have no way to its cause.
const readiness = vi.hoisted(() => ({ items: [] as { id: string }[] }));
vi.mock('../src/store/readiness', () => ({
  useReadiness: () => ({ items: readiness.items, collisions: [], clamps: [] }),
}));

const hide = (...ids: ('series' | 'jigs' | 'macros')[]) =>
  useWorkshop.getState().setSettings({ hiddenFeatures: ids });

describe('the gate around the entry points of a hideable function', () => {
  beforeEach(() => {
    readiness.items = [];
    hide();
  });
  afterEach(cleanup);

  it('shows what is not hidden', () => {
    render(<Feature id="series">card</Feature>);
    expect(screen.queryByText('card')).not.toBeNull();
  });

  it('takes a hidden function away and brings it back with the setting', () => {
    hide('series');
    const { rerender } = render(<Feature id="series">card</Feature>);
    expect(screen.queryByText('card')).toBeNull();
    hide();
    rerender(<Feature id="series">card</Feature>);
    expect(screen.queryByText('card')).not.toBeNull();
  });

  it('keeps a hidden function that is under way – read from the readiness list', () => {
    hide('series', 'jigs');
    readiness.items = [{ id: 'series' }];
    render(
      <>
        <Feature id="series">series card</Feature>
        <Feature id="jigs">jig card</Feature>
      </>,
    );
    // The series point keeps the series; the jigs have no point of theirs
    expect(screen.queryByText('series card')).not.toBeNull();
    expect(screen.queryByText('jig card')).toBeNull();
  });

  it('never keeps the macros: they have no flow', () => {
    hide('macros');
    readiness.items = [{ id: 'series' }, { id: 'jig' }];
    render(<Feature id="macros">macro card</Feature>);
    expect(screen.queryByText('macro card')).toBeNull();
  });

  it('says on the switch card that a hidden flow stays while it is under way', () => {
    hide('jigs');
    const { unmount } = render(<FeaturesCard />);
    expect(screen.queryByText(t('features.underWay'))).toBeNull();
    unmount();
    readiness.items = [{ id: 'jig' }];
    render(<FeaturesCard />);
    expect(screen.queryByText(t('features.underWay'))).not.toBeNull();
  });
});
