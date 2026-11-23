import { useEffect, useRef, useState } from 'react';
import { t } from '../i18n';
import { machineToImage } from '../lib/camera';
import { zoneCentre, zoneHandles, zoneRadius } from '../lib/clamps';
import { formatNumber } from '../lib/format';
import { jigsWithTag, tagCorners, tagLabel } from '../lib/jigs';
import { zoomAround, type Limits, type Transform } from '../lib/gesture';
import {
  cameraElement,
  edgeAt,
  holeAt,
  mountCamera,
  naturalSize,
  pixelToMachine,
  tapToMachine,
  useCamera,
} from '../store/camera';
import { useClampHits } from '../store/clamps';
import { useJigs } from '../store/jigs';
import { useJob } from '../store/job';
import { useMachine } from '../store/machine';
import { cameraCalibrated } from '../store/photomap';
import { useStageTools, type StagePoint } from '../store/tools';
import { useWorkshop } from '../store/workshop';
import { provideLoupe } from './Loupe';
import { activeTool, grabStage, tapStage } from './StageTools';
import { GRAB_PX } from './TableView';
import { usePanZoom } from './usePanZoom';
import { Alert } from '../ui/alert';
import { Button } from '../ui/button';

/** Closest digital zoom of the live picture */
const MAX_ZOOM = 8;
/** A double tap on the whole picture zooms in by this much on the spot */
const DOUBLE_TAP_ZOOM = 2.5;
const WHOLE: Transform = { scale: 1, x: 0, y: 0 };

/**
 * The live camera picture as the stage, like the Datron Neo: crosshair and
 * toolpath lie on the picture, and a tap gives the active stage tool the
 * machine point under the finger. While the camera is being set up, taps
 * measure its scale and offset instead; with the measuring tool a tap on a
 * hole takes the hole's centre. Two fingers zoom the picture for a
 * precise tap (digital zoom, the same gesture layer as the table); a double
 * tap zooms in on the spot and back to the whole picture.
 */
export function CameraView() {
  // In state, not a ref: the gesture layer connects when the picture appears.
  const [stage, setStage] = useState<HTMLDivElement | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  // The digital zoom lives outside React state: it is written per frame.
  const zoom = useRef<Transform>(WHOLE);
  const [shownZoom, setShownZoom] = useState(1);
  const source = useCamera((s) => s.source);
  const error = useCamera((s) => s.error);
  const { switchOn } = useCamera.getState();
  // Clamps the job is in the way of, for the painter (it runs outside React).
  const warnedZones = useRef(new Set<number>());
  warnedZones.current = new Set(useClampHits().map((h) => h.fixture));

  useEffect(() => (source ? mountCamera(box.current!) : undefined), [source]);

  const stageSize = () => ({
    width: stage?.clientWidth ?? 0,
    height: stage?.clientHeight ?? 0,
  });
  const limits = (): Limits => {
    const { width, height } = stageSize();
    return {
      minScale: 1,
      maxScale: MAX_ZOOM,
      // The zoomed picture always fills its frame.
      origin: (scale) => ({
        x: { min: width - width * scale, max: 0 },
        y: { min: height - height * scale, max: 0 },
      }),
    };
  };
  /** A point of the stage (CSS px) as a pixel of the camera picture, through the zoom. */
  const toPicture = (p: { x: number; y: number }, outside = false) => {
    const size = naturalSize();
    const canvas = overlay.current;
    if (!size || !canvas || !stage) return null;
    const frame = stage.getBoundingClientRect();
    const r = canvas.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return null;
    const px = {
      x: ((frame.left + p.x - r.left) / r.width) * size.width,
      y: ((frame.top + p.y - r.top) / r.height) * size.height,
    };
    const inside = px.x >= 0 && px.y >= 0 && px.x <= size.width && px.y <= size.height;
    return inside || outside ? px : null;
  };
  /** A tap on the picture: a measurement while setting up, else a point for the tool. */
  const tap = (p: { x: number; y: number }): void | (() => void) => {
    const px = toPicture(p);
    if (!px) return;
    if (useCamera.getState().tapMode) {
      useCamera.getState().tap(px);
      return;
    }
    // Only a calibrated picture can give machine points.
    if (!cameraCalibrated(useWorkshop.getState().settings.camera)) return;
    // A tap on a hole means the hole (its centre; the diameter comes along), a
    // tap at the workpiece's corner or edge means that – when the picture shows it.
    const snap = activeTool().snap?.();
    const hole = snap === 'hole' ? holeAt(px) : null;
    const edge = snap === 'corner' || snap === 'edge' ? edgeAt(px, snap) : null;
    const at = pixelToMachine(hole?.px ?? edge ?? px);
    if (!at) return;
    const point: StagePoint = hole
      ? { ...at, hole: hole.diameter }
      : edge && snap !== 'hole' && snap
        ? { ...at, snapped: snap }
        : at;
    // The picture may be letterboxed: "low" counts within the whole stage.
    return tapStage(point, p.y > stageSize().height / 2);
  };
  /** A finger on a tapped point or a clamp takes that, not the picture. */
  const grab = (p: { x: number; y: number }) => {
    const cal = useWorkshop.getState().settings.camera;
    const size = naturalSize();
    const r = overlay.current?.getBoundingClientRect();
    if (useCamera.getState().tapMode || !cameraCalibrated(cal) || !size || !r?.width) return null;
    // Dragged past the picture's edge, the thing still follows.
    const machine = (q: { x: number; y: number }) => {
      const px = toPicture(q, true);
      return px ? pixelToMachine(px) : null;
    };
    const from = machine(p);
    if (!from) return null;
    const shownPxPerMm = (r.width / size.width) * cal.pxPerMm;
    const taken = grabStage(from, GRAB_PX / shownPxPerMm);
    if (!taken) return null;
    return {
      move(q: { x: number; y: number }) {
        const to = machine(q);
        if (to) taken.move(to);
      },
      end: () => undefined,
    };
  };
  const gesture = usePanZoom(stage, {
    read: () => (source ? zoom.current : null),
    write(t) {
      zoom.current = t;
      if (box.current) {
        box.current.style.transform =
          t.scale === 1 && t.x === 0 && t.y === 0
            ? ''
            : `translate(${t.x}px, ${t.y}px) scale(${t.scale})`;
      }
      const rounded = Math.round(t.scale * 10) / 10;
      setShownZoom((z) => (z === rounded ? z : rounded));
    },
    limits,
    size: stageSize,
    tap,
    grab,
    doubleTap(p) {
      // While measuring, every tap counts – two quick ones too.
      if (useCamera.getState().tapMode) {
        tap(p);
        return;
      }
      gesture.glideTo(
        zoom.current.scale > 1.01 ? WHOLE : zoomAround(zoom.current, p, DOUBLE_TAP_ZOOM),
      );
    },
  });
  // A new picture starts whole.
  useEffect(() => {
    gesture.stop();
    zoom.current = WHOLE;
    if (box.current) box.current.style.transform = '';
    setShownZoom(1);
  }, [source, gesture]);

  // The loupe of the stage tools shows the live picture, magnified around a point.
  useEffect(
    () =>
      provideLoupe((ctx, centre, scale, side, dpr) => {
        const el = cameraElement();
        const size = naturalSize();
        const status = useMachine.getState().status;
        if (!el || !size || !status) return;
        const cal = useWorkshop.getState().settings.camera;
        const sp = { x: status.mpos[0] ?? 0, y: status.mpos[1] ?? 0 };
        const px = machineToImage(cal, centre, size, sp);
        const k = (scale * dpr) / cal.pxPerMm;
        // Machine +X to the right, whatever way the camera is mounted.
        ctx.translate((side * dpr) / 2, (side * dpr) / 2);
        ctx.rotate((-cal.rotation * Math.PI) / 180);
        ctx.scale(k, k);
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(el, -px.x, -px.y);
      }),
    [],
  );

  // Crosshair, toolpath, clamps and tapped points on top of the picture.
  useEffect(() => {
    let frame = requestAnimationFrame(function draw() {
      const canvas = overlay.current;
      const size = naturalSize();
      const status = useMachine.getState().status;
      const media = box.current?.querySelector<HTMLElement>('video, img, canvas:not(.overlay)');
      if (canvas && size && media) {
        if (canvas.width !== size.width) canvas.width = size.width;
        if (canvas.height !== size.height) canvas.height = size.height;
        // Lie exactly on the picture, which may be letterboxed in the stage.
        const style = `left:${media.offsetLeft}px;top:${media.offsetTop}px;width:${media.offsetWidth}px;height:${media.offsetHeight}px`;
        if (canvas.style.cssText !== style) canvas.style.cssText = style;
        const ctx = canvas.getContext('2d')!;
        const css = getComputedStyle(canvas);
        const color = (name: string, fallback: string) =>
          css.getPropertyValue(name).trim() || fallback;
        // Lines keep their width on screen through the digital zoom.
        const unit = Math.max(1, size.width / 400) / zoom.current.scale;
        ctx.clearRect(0, 0, size.width, size.height);
        ctx.lineWidth = unit;
        ctx.strokeStyle = color('--stage-select', '#2b7fff');
        ctx.beginPath();
        ctx.moveTo(size.width / 2 - 24 * unit, size.height / 2);
        ctx.lineTo(size.width / 2 + 24 * unit, size.height / 2);
        ctx.moveTo(size.width / 2, size.height / 2 - 24 * unit);
        ctx.lineTo(size.width / 2, size.height / 2 + 24 * unit);
        ctx.stroke();
        const analysis = useJob.getState().analysis;
        const cal = useWorkshop.getState().settings.camera;
        if (analysis && status?.wco) {
          const sp = { x: status.mpos[0] ?? 0, y: status.mpos[1] ?? 0 };
          const [ox = 0, oy = 0] = status.wco;
          ctx.strokeStyle = color('--stage-cut', '#fb2c36');
          ctx.beginPath();
          for (const seg of analysis.segments) {
            if (seg.motion === 'rapid' || seg.machineCoordinates) continue;
            const a = machineToImage(cal, { x: seg.from.x + ox, y: seg.from.y + oy }, size, sp);
            const b = machineToImage(cal, { x: seg.to.x + ox, y: seg.to.y + oy }, size, sp);
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
          }
          ctx.stroke();
        }
        // Tapped points are machine points: they stay on the feature while the camera moves.
        const sp = status ? { x: status.mpos[0] ?? 0, y: status.mpos[1] ?? 0 } : null;
        const camera = useCamera.getState();
        const tools = useStageTools.getState();
        // Clamps and screws, where they lie on the table (pinned: machine XY).
        const setup = useWorkshop.getState().setup;
        if (sp && !camera.tapMode && setup.fixtureFrame === 'machine') {
          setup.fixtures.forEach((f, i) => {
            const selected = tools.active === 'clamp' && tools.zone === i;
            const warned = warnedZones.current.has(i);
            const shape = new Path2D();
            if (f.round) {
              const c = machineToImage(cal, zoneCentre(f), size, sp);
              shape.arc(c.x, c.y, zoneRadius(f) * cal.pxPerMm, 0, Math.PI * 2);
            } else {
              const corners = [
                { x: f.min.x, y: f.min.y },
                { x: f.max.x, y: f.min.y },
                { x: f.max.x, y: f.max.y },
                { x: f.min.x, y: f.max.y },
              ].map((p) => machineToImage(cal, p, size, sp));
              corners.forEach((p, k) => (k ? shape.lineTo(p.x, p.y) : shape.moveTo(p.x, p.y)));
              shape.closePath();
            }
            ctx.globalAlpha = 0.3;
            ctx.fillStyle = warned
              ? color('--stage-current', '#fe9a00')
              : color('--stage-muted', '#8a8a8a');
            ctx.fill(shape);
            ctx.globalAlpha = 1;
            ctx.strokeStyle = color('--stage-bg', '#161616');
            ctx.lineWidth = 5 * unit;
            ctx.stroke(shape);
            ctx.strokeStyle = selected
              ? color('--stage-select', '#2b7fff')
              : warned
                ? color('--stage-current', '#fe9a00')
                : color('--stage-text', '#f5f5f5');
            ctx.lineWidth = 2.5 * unit;
            ctx.stroke(shape);
            if (!selected) return;
            for (const h of zoneHandles(f)) {
              const p = machineToImage(cal, h, size, sp);
              ctx.beginPath();
              ctx.arc(p.x, p.y, 7 * unit, 0, Math.PI * 2);
              ctx.fillStyle = color('--stage-select', '#2b7fff');
              ctx.fill();
              ctx.strokeStyle = color('--stage-text', '#f5f5f5');
              ctx.lineWidth = 2 * unit;
              ctx.stroke();
            }
          });
        }
        // Printed tags the camera sees: a frame around each, with its number and its jig.
        if (sp && !camera.tapMode) {
          const { seen, refused } = useJigs.getState();
          const jigs = useWorkshop.getState().jigs;
          const frame = (corners: readonly { x: number; y: number }[]) => {
            const shape = new Path2D();
            corners
              .map((p) => machineToImage(cal, p, size, sp))
              .forEach((p, k) => (k ? shape.lineTo(p.x, p.y) : shape.moveTo(p.x, p.y)));
            shape.closePath();
            return shape;
          };
          const outlined = (shape: Path2D, tone: string, dashed = false) => {
            ctx.setLineDash([]);
            ctx.strokeStyle = color('--stage-bg', '#161616');
            ctx.lineWidth = 5 * unit;
            ctx.stroke(shape);
            ctx.strokeStyle = tone;
            ctx.lineWidth = 2.5 * unit;
            if (dashed) ctx.setLineDash([8 * unit, 6 * unit]);
            ctx.stroke(shape);
            ctx.setLineDash([]);
          };
          const named = (text: string, at: { x: number; y: number }, tone: string) => {
            ctx.font = `600 ${9 * unit}px system-ui, sans-serif`;
            ctx.textAlign = 'center';
            ctx.lineJoin = 'round';
            ctx.strokeStyle = color('--stage-bg', '#161616');
            ctx.lineWidth = 3 * unit;
            ctx.strokeText(text, at.x, at.y);
            ctx.fillStyle = tone;
            ctx.fillText(text, at.x, at.y);
          };
          const above = (corners: readonly { x: number; y: number }[]) => {
            const px = corners.map((p) => machineToImage(cal, p, size, sp));
            return {
              x: px.reduce((sum, p) => sum + p.x, 0) / px.length,
              y: Math.min(...px.map((p) => p.y)) - 5 * unit,
            };
          };
          for (const tag of seen) {
            const corners = tagCorners(tag);
            const known = jigsWithTag(jigs, tag.id).length > 0;
            const tone = known
              ? color('--stage-done', '#00bc7d')
              : color('--stage-text', '#f5f5f5');
            outlined(frame(corners), tone);
            named(tagLabel(jigs, tag.id, t('jigs.tagOne', { n: tag.id })), above(corners), tone);
          }
          // What is nearly a tag: dashed, with the reason in a word.
          for (const r of refused) {
            const tone = color('--stage-current', '#fe9a00');
            outlined(frame(r.outline), tone, true);
            named(t(`jigs.short.${r.reason}`), above(r.outline), tone);
          }
        }
        const marks = camera.tapMode
          ? camera.taps.map((tp) => {
              const m = tapToMachine(tp);
              return m && sp ? machineToImage(cal, m, size, sp) : tp.px;
            })
          : sp
            ? tools.points.map((m) => machineToImage(cal, m, size, sp))
            : [];
        const tool = activeTool(tools.active);
        const marksPath = () => {
          ctx.beginPath();
          for (const p of marks) {
            ctx.moveTo(p.x + 10 * unit, p.y);
            ctx.arc(p.x, p.y, 10 * unit, 0, Math.PI * 2);
            ctx.moveTo(p.x - 16 * unit, p.y);
            ctx.lineTo(p.x + 16 * unit, p.y);
            ctx.moveTo(p.x, p.y - 16 * unit);
            ctx.lineTo(p.x, p.y + 16 * unit);
          }
          if (!camera.tapMode && tool.line && marks.length > 1) {
            ctx.moveTo(marks[0]!.x, marks[0]!.y);
            for (const p of marks.slice(1)) ctx.lineTo(p.x, p.y);
          }
        };
        // A dark rim keeps the marks readable on light wood.
        marksPath();
        ctx.strokeStyle = color('--stage-bg', '#161616');
        ctx.lineWidth = 4 * unit;
        ctx.stroke();
        marksPath();
        ctx.strokeStyle = color('--stage-current', '#fe9a00');
        ctx.lineWidth = 2 * unit;
        ctx.stroke();
        const label = camera.tapMode ? null : tool.lineLabel?.(tools.points);
        if (label && marks.length > 1) {
          // The distance at the middle of its line.
          const a = marks[marks.length - 2]!;
          const b = marks[marks.length - 1]!;
          ctx.font = `600 ${13 * unit}px system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.lineJoin = 'round';
          ctx.strokeStyle = color('--stage-bg', '#161616');
          ctx.lineWidth = 6 * unit;
          ctx.strokeText(label, (a.x + b.x) / 2, (a.y + b.y) / 2 - 10 * unit);
          ctx.fillStyle = color('--stage-current', '#fe9a00');
          ctx.fillText(label, (a.x + b.x) / 2, (a.y + b.y) / 2 - 10 * unit);
        }
      }
      frame = requestAnimationFrame(draw);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  if (!source) {
    return (
      <div className="camera-stage empty" data-testid="camera-stage">
        <p className="text-muted-foreground text-sm">{t('stage.cameraOff')}</p>
        <Button onClick={switchOn}>{t('stage.cameraOn')}</Button>
      </div>
    );
  }

  return (
    <div className="camera-stage" data-testid="camera-stage" data-zoom={shownZoom} ref={setStage}>
      <div className="camera-picture" ref={box}>
        <canvas ref={overlay} className="overlay" data-testid="camera-overlay" />
      </div>
      {shownZoom > 1 ? (
        <Button
          variant="outline"
          className="zoom-reset tabular-nums"
          data-testid="camera-zoom-reset"
          onClick={() => gesture.glideTo(WHOLE)}
        >
          {t('stage.zoomReset', { zoom: formatNumber(shownZoom, 1) })}
        </Button>
      ) : null}
      {error ? (
        <Alert variant="error" className="camera-error">
          {t('camera.error', { reason: error })}
        </Alert>
      ) : null}
    </div>
  );
}
