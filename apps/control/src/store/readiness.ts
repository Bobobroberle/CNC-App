import { IDENTITY, type Matrix } from '@lowrider/cam';
import { removeToolLengthTable } from '@lowrider/gcode-core';
import { useMemo } from 'react';
import { flipReadiness } from '../lib/flip';
import { jigState } from '../lib/jigs';
import { controllerIssues } from '../lib/jobChecks';
import { preparedFor } from '../lib/prepare';
import { jobReadiness, type ReadinessItem } from '../lib/readiness';
import { sectionAxis, sectionOf, sectionsState } from '../lib/sections';
import { defaultStock, firstTool, jobCollisions, toolForJob } from '../lib/setup';
import type { ClampHit, Collision } from '@lowrider/gcode-core';
import { travelViolations } from '../lib/workspace';
import { useClampHits, useWorkFixtures } from './clamps';
import { useFlip } from './flip';
import { useJigs } from './jigs';
import { useJob } from './job';
import { useMachine } from './machine';
import { useSections } from './sections';
import { useSeries } from './series';
import { useJobTools } from './jobTools';
import { useWorkshop } from './workshop';

export interface Readiness {
  items: ReadinessItem[];
  collisions: Collision[];
  /** Clamps the job runs into or passes too low */
  clamps: ClampHit[];
}

/**
 * Collisions the clamp check does not name already: a clamp the tool runs
 * into is listed by its name with what to do about it, once.
 */
export function otherCollisions(
  collisions: readonly Collision[],
  clamps: readonly ClampHit[],
): Collision[] {
  const named = new Set(clamps.map((c) => c.name));
  return collisions.filter((c) => c.kind !== 'tool-fixture' && !named.has(c.object));
}

/** The readiness of the loaded job against the live machine; null without a job. */
export function useReadiness(): Readiness | null {
  const jobTools = useJobTools();
  const spindle = useWorkshop((s) => s.settings.spindle);
  const analysis = useJob((s) => s.analysis);
  const lines = useJob((s) => s.lines);
  const profile = useJob((s) => s.profile);
  const connected = useMachine((s) => s.connection === 'connected');
  const busy = useMachine(
    (s) =>
      s.fileJob !== null ||
      s.stream?.result === 'running' ||
      (s.status !== null && s.status.state !== 'Idle'),
  );
  const homed = useMachine((s) => s.homed);
  // Only the offsets and a rounded start position matter, not every report.
  const wcoKey = useMachine((s) => s.status?.wco.join(',') ?? null);
  const mposKey = useMachine((s) => s.status?.mpos.map((v) => Math.round(v)).join(',') ?? null);
  const tools = useWorkshop((s) => s.tools);
  const headerDiameter = useJob((s) => s.header?.tools.find((x) => x.diameter)?.diameter);
  const setup = useWorkshop((s) => s.setup);
  const fixtures = useWorkFixtures();
  const clamps = useClampHits();
  const flipPlan = useFlip((s) => s.plan);
  const flipPhase = useFlip((s) => s.phase);
  // An aligned copy counts as the side it was made from.
  const madeAs = useJob((s) => s.original?.fileName ?? s.fileName);
  const seriesMade = useSeries((s) => s.made);
  const pose = useJob((s) => s.pose);
  const jigLoaded = useJigs((s) => s.loaded);
  const jigPlaced = useJigs((s) => s.placed);
  const jig = useWorkshop((s) => s.jigs.find((j) => j.id === jigLoaded?.jigId));
  const sectionsJob = useSections((s) => s.job);
  const sectionsIndex = useSections((s) => s.index);
  const sectionsPhase = useSections((s) => s.phase);
  const sectionsLocated = useSections((s) => s.located);

  const text = useMemo(() => removeToolLengthTable(lines.join('\n')).text, [lines]);
  const outside = useMemo(() => {
    if (!connected || wcoKey === null || mposKey === null) return null;
    const n = (k: string) => k.split(',').map(Number);
    return travelViolations(text, profile, n(wcoKey), n(mposKey));
  }, [connected, text, profile, wcoKey, mposKey]);
  const collisions = useMemo(() => {
    if (!analysis) return [];
    const stock = setup.stock ?? defaultStock(analysis.cutBounds);
    const first = firstTool(analysis);
    const tool = toolForJob(tools, setup.toolMap, first, headerDiameter);
    return stock && tool ? jobCollisions(analysis.segments, stock, fixtures, tool) : [];
  }, [analysis, setup, fixtures, tools, headerDiameter]);

  const speeds = useMemo(() => {
    if (!analysis) return null;
    let min = Infinity;
    let max = 0;
    for (const s of analysis.segments) {
      if (s.motion === 'rapid' || s.spindle === 'off' || s.spindleSpeed <= 0) continue;
      min = Math.min(min, s.spindleSpeed);
      max = Math.max(max, s.spindleSpeed);
    }
    return max > 0 ? { min, max } : null;
  }, [analysis]);

  if (!analysis) return null;
  const stock = setup.stock ?? defaultStock(analysis.cutBounds);
  // Errors that are left once the job is prepared (G43 H is repaired on the way).
  const fileName = useJob.getState().fileName ?? '';
  const parts = preparedFor(fileName, lines, profile.kinematics).parts;
  const items = jobReadiness({
    connected,
    busy,
    homed,
    errors: parts.reduce((sum, p) => sum + p.errors, 0),
    controllerErrors: controllerIssues(analysis, profile.controller).filter(
      (i) => i.severity === 'error',
    ).length,
    outside: outside === null ? null : outside.length,
    // Sections of a job that is one of another flow's programs would lose that flow.
    long:
      outside &&
      // A flow of which nothing is cut gives way to another job that is too long.
      (!sectionsJob ||
        (sectionsIndex === 0 && sectionsPhase === 'cut' && sectionOf(sectionsJob, madeAs) < 0)) &&
      !flipReadiness(flipPlan, flipPhase, madeAs) &&
      !jig &&
      seriesMade?.fileName !== madeAs
        ? sectionAxis(outside)
        : null,
    sections: sectionsState(
      {
        job: sectionsJob,
        index: sectionsIndex,
        phase: sectionsPhase,
        located: sectionsLocated,
      },
      madeAs,
      wcoKey === null ? null : wcoKey.split(',').map(Number),
      pose,
    ),
    zeroAtOrigin:
      connected && wcoKey !== null ? wcoKey.split(',').every((v) => Number(v) === 0) : null,
    collisions: otherCollisions(collisions, clamps).length,
    clamps,
    placeholderProfile: profile.placeholder,
    depth: stock
      ? { cut: Math.max(0, -analysis.cutBounds.min.z), stock: stock.max.z - stock.min.z }
      : null,
    tools: { used: jobTools.length, open: jobTools.filter((x) => x.state !== 'ok').length },
    limits: {
      feed: analysis.feedRange?.max ?? null,
      feedMax: Math.max(
        profile.kinematics.axes.x.maxRate,
        profile.kinematics.axes.y.maxRate,
        profile.kinematics.axes.z.maxRate,
      ),
      // A spindle the controller does not switch is set by hand: its speed is not the program's.
      rpm: profile.controller.spindleControlled ? speeds : null,
      rpmMin: spindle.rpmMin,
      rpmMax: spindle.rpmMax,
    },
    flip: flipReadiness(flipPlan, flipPhase, madeAs),
    // A levelled copy is still the series; one that was turned or shifted no longer lies on the blanks.
    series:
      seriesMade && seriesMade.fileName === madeAs
        ? {
            count: seriesMade.count,
            moved:
              wcoKey !== null &&
              Math.hypot(
                Number(wcoKey.split(',')[0]) - seriesMade.zero.x,
                Number(wcoKey.split(',')[1] ?? 0) - seriesMade.zero.y,
              ) > 0.005,
            turned: (Object.keys(IDENTITY) as (keyof Matrix)[]).some(
              (k) => Math.abs(pose[k] - IDENTITY[k]) > 1e-9,
            ),
          }
        : null,
    jig: jig
      ? {
          name: jig.name,
          state: jigState(
            jigPlaced?.jigId === jig.id ? jigPlaced : null,
            wcoKey === null ? null : wcoKey.split(',').map(Number),
            pose,
          ),
        }
      : null,
  });
  return { items, collisions, clamps };
}
