import { create } from 'zustand';
import { ScreenKeeper, type KeepAwake } from '../lib/wakeLock';
import { useMachine } from './machine';
import { useWorkshop } from './workshop';

/** How the screen is being kept on, for Maschine → Verbindung. */
export const useWake = create<{ state: KeepAwake }>(() => ({ state: 'off' }));

/** The moments a browser accepts as "the operator did this" for starting a video */
const GESTURES = ['pointerup', 'touchend', 'click', 'keydown'] as const;

/** Screen stays on while connected, if the setting allows it. */
export function startScreenKeeper(): () => void {
  const keeper = new ScreenKeeper(undefined, {
    onChange: (state) => useWake.setState({ state }),
  });
  const update = () =>
    void keeper.set(
      useWorkshop.getState().settings.keepAwake && useMachine.getState().connection === 'connected',
    );
  const offMachine = useMachine.subscribe((s, prev) => {
    if (s.connection !== prev.connection) update();
  });
  const offSettings = useWorkshop.subscribe((s, prev) => {
    if (s.settings.keepAwake !== prev.settings.keepAwake) update();
  });
  // Without https the screen is kept on by a silent video, which may only start from a touch.
  const gesture = () => keeper.gesture();
  if (typeof document !== 'undefined') {
    for (const type of GESTURES) document.addEventListener(type, gesture, true);
  }
  update();
  return () => {
    offMachine();
    offSettings();
    if (typeof document !== 'undefined') {
      for (const type of GESTURES) document.removeEventListener(type, gesture, true);
    }
    void keeper.set(false);
  };
}
