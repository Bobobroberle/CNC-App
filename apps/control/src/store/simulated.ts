import { isSimulatorAddress } from '../sim';
import { useMachine } from './machine';

/** A simulated machine is the machine now: what it measures and what is set meanwhile is no machine's. */
export function simulatorActive(): boolean {
  const { connection, url } = useMachine.getState();
  return connection !== 'disconnected' && isSimulatorAddress(url);
}
