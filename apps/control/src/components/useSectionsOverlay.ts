import { interpret } from '@lowrider/gcode-core';
import { fromJig, type PartPose } from '@lowrider/workshop';
import { useMemo } from 'react';
import { t } from '../i18n';
import { tagCorners } from '../lib/jigs';
import { jobBox, markBand, sectionOf } from '../lib/sections';
import type { SectionsMark } from '../render/draw';
import { projection, traceSegment, type Extent } from '../render/paths';
import { useJob } from '../store/job';
import { useSections } from '../store/sections';
import { useWorkshop } from '../store/workshop';

/**
 * A part longer than the table on the table picture: the whole part around
 * the section that is the job – what is cut already and what is still to
 * come –, the seams, the band for the register marks while they are to be
 * stuck on, and the marks once they are measured. Only while a section of
 * the flow is the loaded program; `zero` is the X/Y work zero (machine XY).
 */
export function useSectionsOverlay(zero: { x: number; y: number } | null): {
  mark: SectionsMark | null;
  extent: Extent | null;
  /** For the tests: "2/3:cut" */
  state: string | undefined;
  /** The tags it draws as register marks, by number */
  markIds: readonly number[];
} {
  const job = useSections((s) => s.job);
  const index = useSections((s) => s.index);
  const phase = useSections((s) => s.phase);
  const cut = useSections((s) => s.cut);
  const angle = useSections((s) => s.angle);
  const marks = useSections((s) => s.marks);
  const loaded = useJob((s) => s.original?.fileName ?? s.fileName);
  const travel = useJob((s) => s.profile.travel);
  const camera = useWorkshop((s) => s.settings.camera);
  const zx = zero?.x;
  const zy = zero?.y;

  // What each section cuts, in the part's coordinates: made once per job.
  const paths = useMemo(() => {
    if (!job || typeof Path2D === 'undefined') return [];
    const top = projection('top', 0);
    return job.parts.map((part) => {
      const path = new Path2D();
      for (const s of interpret(part.text).segments) {
        if (s.motion !== 'rapid' && !s.machineCoordinates) traceSegment(path, s, top);
      }
      return path;
    });
  }, [job]);

  return useMemo(() => {
    const none = { mark: null, extent: null, state: undefined, markIds: [] };
    if (!job || zx === undefined || zy === undefined || sectionOf(job, loaded) < 0) return none;
    // How the part lies: as the section at hand is loaded, or as it was cut.
    const pose: PartPose = phase === 'cut' || !cut ? { x: zx, y: zy, angle } : cut;
    const work = (p: { x: number; y: number }): [number, number] => {
      const q = fromJig(pose, p);
      return [q.x - zx, q.y - zy];
    };
    const a = (pose.angle * Math.PI) / 180;
    const box = jobBox(job);
    const x = job.axis === 'x';
    const cutSoFar = phase === 'cut' ? index : index + 1;
    const seams = box
      ? job.plan.seams.map((seam) => {
          const from = x ? { x: seam.at, y: box.minY - 12 } : { x: box.minX - 12, y: seam.at };
          const to = x ? { x: seam.at, y: box.maxY + 12 } : { x: box.maxX + 12, y: seam.at };
          return {
            line: [...work(from), ...work(to)] as [number, number, number, number],
            label:
              seam.cuts === 0
                ? t('sections.table.seam')
                : t('sections.table.seamCuts', { count: seam.cuts }),
          };
        })
      : [];
    const band =
      phase === 'marks' && cut
        ? markBand(job, cut, {
            minX: travel.x.min + camera.offsetX,
            maxX: travel.x.max + camera.offsetX,
            minY: travel.y.min + camera.offsetY,
            maxY: travel.y.max + camera.offsetY,
          })
        : null;
    // Measured and not slid yet, or found again: the marks lie where the part's frame puts them.
    const shown = phase === 'slide' || (phase === 'cut' && index > 0) ? marks : [];
    const corners = box
      ? [
          work({ x: box.minX, y: box.minY }),
          work({ x: box.maxX, y: box.minY }),
          work({ x: box.maxX, y: box.maxY }),
          work({ x: box.minX, y: box.maxY }),
        ]
      : [];
    const mark: SectionsMark = {
      frame: [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), pose.x - zx, pose.y - zy],
      done: paths.slice(0, cutSoFar),
      coming: paths.slice(phase === 'cut' ? index + 1 : cutSoFar),
      seams,
      zone: band && {
        box: {
          minU: band.minX - zx,
          maxU: band.maxX - zx,
          minV: band.minY - zy,
          maxV: band.maxY - zy,
        },
        label: t('sections.table.zone'),
      },
      marks: shown.map((m) => ({
        outline: tagCorners(m).map(work),
        label: t('sections.table.mark', { n: m.id }),
      })),
    };
    return {
      mark,
      extent:
        corners.length > 0
          ? {
              minU: Math.min(...corners.map((p) => p[0])),
              maxU: Math.max(...corners.map((p) => p[0])),
              minV: Math.min(...corners.map((p) => p[1])),
              maxV: Math.max(...corners.map((p) => p[1])),
            }
          : null,
      state: `${index + 1}/${job.parts.length}:${phase}`,
      markIds: shown.map((m) => m.id),
    };
  }, [job, index, phase, cut, angle, marks, loaded, travel, camera, zx, zy, paths]);
}
