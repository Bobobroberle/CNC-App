import { describe, expect, it, vi } from 'vitest';
import { useMachine } from '../src/store/machine';
import { handleSensorUpdate, useSensors } from '../src/store/sensors';
import { useWorkshop } from '../src/store/workshop';

const update = (load: number | null) => ({
  at: 1,
  load,
  rpm: 18000,
  chatter: false,
  chatterFrequency: 0,
  vibration: 0.1,
  source: 'simulator',
});

describe('adaptive feed from sensor data', () => {
  it('only acts while running, when enabled, and not too often', () => {
    const setFeedOverride = vi.fn();
    useMachine.setState({
      setFeedOverride,
      status: { state: 'Idle', overrides: { feed: 100, rapid: 100, spindle: 100 } } as never,
    });
    const adaptive = useWorkshop.getState().settings.adaptive;
    useWorkshop.getState().setSettings({ adaptive: { ...adaptive, enabled: true } });

    handleSensorUpdate(update(30), 1000);
    expect(useSensors.getState()).toMatchObject({ connected: true, load: 30 });
    expect(setFeedOverride).not.toHaveBeenCalled();

    useMachine.setState({
      status: { state: 'Run', overrides: { feed: 100, rapid: 100, spindle: 100 } } as never,
    });
    handleSensorUpdate(update(30), 2000);
    expect(setFeedOverride).toHaveBeenLastCalledWith(105);
    handleSensorUpdate(update(30), 2200);
    expect(setFeedOverride).toHaveBeenCalledTimes(1);
    handleSensorUpdate(update(72), 3000);
    handleSensorUpdate(update(null), 4000);
    expect(setFeedOverride).toHaveBeenCalledTimes(1);

    useWorkshop.getState().setSettings({ adaptive: { ...adaptive, enabled: false } });
    handleSensorUpdate(update(10), 5000);
    expect(setFeedOverride).toHaveBeenCalledTimes(1);
  });
});
