import { afterEach, describe, expect, it } from 'vitest';
import { PLACES, shellParts, useUi } from '../src/store/ui';

/**
 * The drawing workspace shows only itself and the status bar (DESIGN.md §4): no action bar with
 * the jog button, no bar of a running job, no stage tools, no jog panel over it. One predicate says
 * so, and what lays the jog panel over a place goes through it.
 */
describe('what the shell shows around a place', () => {
  afterEach(() => {
    useUi.setState({ place: 'start', jogOpen: false });
  });

  it('shows everything but in the drawing workspace', () => {
    for (const place of PLACES) {
      const parts = shellParts(place);
      const bare = place === 'cam';
      expect(parts, place).toEqual({
        actionBar: !bare,
        runBar: !bare,
        jog: !bare,
        stageTools: !bare,
      });
    }
  });

  it('opens the jog panel over the place where there may be one', () => {
    for (const place of PLACES.filter((p) => p !== 'cam')) {
      useUi.setState({ place, jogOpen: false });
      useUi.getState().setJogOpen(true);
      expect(useUi.getState(), place).toMatchObject({ place, jogOpen: true });
    }
  });

  it('takes the jog panel from the drawing workspace to Einrichten, where it belongs', () => {
    useUi.setState({ place: 'cam', jogOpen: false, panelHidden: true });
    useUi.getState().setJogOpen(true);
    expect(useUi.getState()).toMatchObject({ place: 'setup', jogOpen: true, panelHidden: false });
  });

  it('never leaves the jog panel open over the drawing workspace', () => {
    useUi.setState({ place: 'run', jogOpen: true });
    useUi.getState().go('cam');
    expect(useUi.getState()).toMatchObject({ place: 'cam', jogOpen: false });
  });

  it('closes the panel as ever', () => {
    useUi.setState({ place: 'run', jogOpen: true });
    useUi.getState().setJogOpen(false);
    expect(useUi.getState().jogOpen).toBe(false);
  });
});
