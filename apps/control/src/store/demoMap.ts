import { DEMO_CAMERA_HEIGHT, DEMO_LONG_SCAN_AREA, DEMO_SCAN_AREA } from '../lib/demo';
import { planScan, visibleSize } from '../lib/photomap';
import { SIM_CAMERA, simulator, simulatorFrame, SURFACE_Z } from '../sim';
import { usePhotoMap } from './photomap';
import { useWorkshop } from './workshop';

/**
 * The demo's photo map, as a scan of plate and board would lay it down:
 * still pictures of the simulated camera on a raster, without moving the
 * machine. Laid anew when the simulated board has been turned over.
 */
export function scanDemoMap() {
  const map = usePhotoMap.getState();
  map.clear();
  const cal = useWorkshop.getState().settings.camera;
  const visible = visibleSize(cal, { width: SIM_CAMERA.width, height: SIM_CAMERA.height });
  const z = SURFACE_Z + DEMO_CAMERA_HEIGHT;
  const area = simulator().scene === 'long' ? DEMO_LONG_SCAN_AREA : DEMO_SCAN_AREA;
  for (const p of planScan(area, visible)) {
    const sp = { x: p.x - cal.offsetX, y: p.y - cal.offsetY };
    map.addPicture(simulatorFrame({ ...sp, z }), sp);
  }
}
