import { checkClamps, type ClampHit, type Fixture } from '@lowrider/gcode-core';
import { useMemo } from 'react';
import { t } from '../i18n';
import type { Point } from '../lib/camera';
import { fixturesInWork, newZone, nextNumber, type ClampKind } from '../lib/clamps';
import { CLAMP_MARGIN, firstTool, toolForJob } from '../lib/setup';
import { useJob } from './job';
import { useMachine } from './machine';
import { useStageTools } from './tools';
import { useWorkshop } from './workshop';

/**
 * The clamps on the table against the live machine: where they lie relative
 * to the work zero right now, and which moves of the job they are in the way
 * of. The zones themselves live in `setup.fixtures` (machine XY).
 */

/** The fixtures in work coordinates right now; empty while the work offset is unknown. */
export function useWorkFixtures(): Fixture[] {
  const fixtures = useWorkshop((s) => s.setup.fixtures);
  const frame = useWorkshop((s) => s.setup.fixtureFrame);
  const ox = useMachine((s) => s.status?.wco[0]);
  const oy = useMachine((s) => s.status?.wco[1]);
  return useMemo(
    () => fixturesInWork(fixtures, frame, ox === undefined ? null : [ox, oy ?? 0]),
    [fixtures, frame, ox, oy],
  );
}

/** Clamps the loaded job runs into or passes too low, one entry per clamp. */
export function useClampHits(): ClampHit[] {
  const analysis = useJob((s) => s.analysis);
  const circle = useJob((s) => s.toolDiameter);
  const headerDiameter = useJob((s) => s.header?.tools.find((x) => x.diameter)?.diameter);
  const tools = useWorkshop((s) => s.tools);
  const toolMap = useWorkshop((s) => s.setup.toolMap);
  const fixtures = useWorkFixtures();
  return useMemo(() => {
    if (!analysis || fixtures.length === 0) return [];
    const tool = toolForJob(tools, toolMap, firstTool(analysis), headerDiameter);
    return checkClamps(analysis.segments, fixtures, {
      toolDiameter: tool?.diameter ?? circle,
      margin: CLAMP_MARGIN,
    });
  }, [analysis, fixtures, tools, toolMap, headerDiameter, circle]);
}

/** Puts a new zone on the table around a machine point and selects it; returns its index. */
export function addZone(kind: ClampKind, centre: Point, tappedLow = false): number {
  const { setup, setSetup } = useWorkshop.getState();
  const name = `${t(`fixtures.kinds.${kind}`)} ${nextNumber(setup.fixtures)}`;
  setSetup({ fixtures: [...setup.fixtures, newZone(kind, centre, name)] });
  useStageTools.getState().selectZone(setup.fixtures.length, tappedLow);
  return setup.fixtures.length;
}

export function updateZone(index: number, zone: Fixture): void {
  const { setup, setSetup } = useWorkshop.getState();
  setSetup({ fixtures: setup.fixtures.map((f, i) => (i === index ? zone : f)) });
}

export function removeZone(index: number): void {
  const { setup, setSetup } = useWorkshop.getState();
  setSetup({ fixtures: setup.fixtures.filter((_, i) => i !== index) });
  const tools = useStageTools.getState();
  // The selection follows the list: gone with its zone, one up for those after it.
  if (tools.zone === index) tools.selectZone(null);
  else if (tools.zone !== null && tools.zone > index) tools.selectZone(tools.zone - 1);
}

/**
 * Fixtures from older storage count from the work zero. The first work
 * offset the machine reports pins them to the table where they lie now.
 */
export function startClamps(): () => void {
  const pin = () => {
    const wco = useMachine.getState().status?.wco;
    if (wco && useWorkshop.getState().setup.fixtureFrame === 'work') {
      useWorkshop.getState().pinFixturesAt(wco);
    }
  };
  pin();
  return useMachine.subscribe(pin);
}
