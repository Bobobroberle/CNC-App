import { useEffect, useState } from 'react';
import { detectMarker, useCalibration } from '../store/calibration';
import { useCamera } from '../store/camera';

/**
 * What the camera sees right now, twice a second, while nothing is being
 * measured: distance of the marker or hole from the crosshair and its size.
 */
export function useLiveMarker(): { off: number; diameter: number } | null {
  const cameraOn = useCamera((c) => c.source !== null && c.size !== null);
  const busy = useCalibration((c) => c.task !== null);
  const [live, setLive] = useState<{ off: number; diameter: number } | null>(null);
  useEffect(() => {
    if (!cameraOn || busy) return;
    const timer = setInterval(() => {
      const d = detectMarker();
      setLive(d ? { off: Math.hypot(d.mm.x, d.mm.y), diameter: d.diameter } : null);
    }, 500);
    return () => clearInterval(timer);
  }, [cameraOn, busy]);
  return cameraOn ? live : null;
}
