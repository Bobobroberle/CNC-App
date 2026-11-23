import { nextOverride } from '@lowrider/workshop';
import { create } from 'zustand';
import { companionBase, sensorStreamUrl } from '../lib/companion';
import { useMachine } from './machine';
import { observeSensors } from './recorder';
import { useWorkshop } from './workshop';

/** Sensor values from the companion (spindle load over RS485, accelerometer). */
export interface SensorState {
  connected: boolean;
  at: number;
  load: number | null;
  rpm: number | null;
  chatter: boolean;
  chatterFrequency: number;
  vibration: number;
  source: string;
}

export const useSensors = create<SensorState>(() => ({
  connected: false,
  at: 0,
  load: null,
  rpm: null,
  chatter: false,
  chatterFrequency: 0,
  vibration: 0,
  source: '',
}));

/** Last time the adaptive feed changed the override; it steps at most twice per second. */
let lastAdaptive = 0;

/** Applies one sensor update: recorder, adaptive feed. */
export function handleSensorUpdate(update: Omit<SensorState, 'connected'>, now = Date.now()): void {
  useSensors.setState({ ...update, connected: true });
  const machine = useMachine.getState();
  const running = machine.status?.state === 'Run';
  if (running) observeSensors(update.load, update.chatter);
  const { adaptive } = useWorkshop.getState().settings;
  if (!adaptive.enabled || !running || update.load === null || now - lastAdaptive < 500) return;
  const current = machine.status!.overrides.feed;
  const next = nextOverride(current, update.load, adaptive);
  if (next !== current) {
    lastAdaptive = now;
    machine.setFeedOverride(next);
  }
}

/** Keeps a WebSocket to the companion's sensor stream while a companion is configured. */
export function startSensorLink(): () => void {
  let socket: WebSocket | null = null;
  let url: string | null = null;
  let retry: ReturnType<typeof setTimeout> | null = null;
  const connect = () => {
    const base = companionBase(useWorkshop.getState().settings.companionUrl);
    const next = base ? sensorStreamUrl(base) : null;
    if (next === url && socket) return;
    socket?.close();
    socket = null;
    url = next;
    if (!next) return;
    const ws = new WebSocket(next);
    socket = ws;
    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(String(e.data));
        handleSensorUpdate({
          at: data.at,
          load: data.load,
          rpm: data.rpm,
          chatter: data.chatter,
          chatterFrequency: data.chatterFrequency,
          vibration: data.vibration,
          source: data.source,
        });
      } catch {
        // ignore malformed frames
      }
    };
    ws.onclose = () => {
      if (socket !== ws) return;
      socket = null;
      useSensors.setState({ connected: false });
      if (retry) clearTimeout(retry);
      retry = setTimeout(connect, 5000);
    };
  };
  const off = useWorkshop.subscribe((s, prev) => {
    if (s.settings.companionUrl !== prev.settings.companionUrl) connect();
  });
  connect();
  return () => {
    off();
    if (retry) clearTimeout(retry);
    url = null;
    socket?.close();
  };
}
