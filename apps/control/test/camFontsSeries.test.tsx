// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SeriesCard } from '../src/components/SeriesCard';
import { t } from '../src/i18n';
import type { TableBlank } from '../src/lib/series';
import { useCam } from '../src/store/cam';
import { openCam } from '../src/store/camPlace';
import { useFlip } from '../src/store/flip';
import { useJob } from '../src/store/job';
import { useSeries } from '../src/store/series';
import { useWorkshop } from '../src/store/workshop';

// jsdom has no observers; the cards want them
class Quiet {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', Quiet);

const cam = () => useCam.getState();
/** One plate of 120 × 120 mm on the table, found and measured as the scan leaves it */
const BLANK: TableBlank = {
  id: 0,
  kind: 'rect',
  x: 200,
  y: 150,
  length: 120,
  width: 120,
  angle: 0,
  outline: [
    { x: 140, y: 90 },
    { x: 260, y: 90 },
    { x: 260, y: 210 },
    { x: 140, y: 210 },
  ],
  measured: false,
};

function scene() {
  cam().close();
  useJob.getState().unload();
  useFlip.getState().cancel();
  useSeries.setState({ open: false, blanks: [BLANK], excluded: [], turns: {}, mode: 'names' });
  cam().setSettings({ toolId: 't2', depth: 6, allowance: 0, engraveDepth: 1 });
  useWorkshop.getState().setSetup({ stock: null, fixtures: [], fixtureFrame: 'machine' });
  openCam();
}

/**
 * The names a series sets on its blanks are laid out in the face of the text of the drawing, so what that face lacks is
 * said per face – with its name, and not for a character another face has.
 */
describe('the series reports the characters its text face lacks – per face', () => {
  beforeEach(scene);
  afterEach(() => {
    cleanup();
    useSeries.setState({ blanks: [], excluded: [], turns: {}, mode: 'same', names: '' });
  });

  const note = () => screen.queryByText(/Diese Zeichen kann die Schrift/);

  it('names the face and the characters, for the standard face', () => {
    cam().addText('Name', { height: 10, align: 'center' });
    useSeries.setState({ names: 'A{1}' });
    render(<SeriesCard />);
    expect(note()?.textContent).toBe(t('series.missing', { font: 'Standard', list: '{ }' }));
  });

  it('says nothing for a face that has them – the same names, another face', () => {
    cam().addText('Name', { height: 10, align: 'center', font: 'simplex' });
    useSeries.setState({ names: 'A{1}' });
    render(<SeriesCard />);
    expect(note()).toBeNull();
  });

  it('names the face of the text for what no face has', () => {
    cam().addText('Name', { height: 10, align: 'center', font: 'script' });
    useSeries.setState({ names: 'A☺' });
    render(<SeriesCard />);
    expect(note()?.textContent).toBe(t('series.missing', { font: 'Schreibschrift', list: '☺' }));
  });
});
