import { create } from 'zustand';
import { failureOf, takeover, type CameraFailure, type Takeover } from '../lib/cameraControls';
import type { CameraControl, CameraControlsAnswer } from '../lib/companion';
import { companion } from './workshop';

/**
 * The camera's picture settings as the companion reads them from the camera (Einstellungen → Kamera → Belichtung und
 * Bild). What the camera reports last is what is shown; a write is answered with the list read again, and that is
 * what replaces it. Nothing here is a setting of the app – it stays in the camera and in the companion's own store.
 */
interface CameraControlsStore {
  /** The list as last read, null before the first read */
  controls: CameraControl[] | null;
  /** Why the last read failed, or null */
  error: CameraFailure | null;
  loading: boolean;
  /** Reads the camera now; throws the failure's code */
  read(): Promise<CameraControl[]>;
  /** Sets settings (one write at a time, one every 0.6 s); throws the failure's code */
  apply(changes: Record<string, number>): Promise<CameraControlsAnswer>;
  /** What the scan panel may take over, from a read made now – never from what was typed or read earlier */
  takeOver(): Promise<Takeover>;
}

/** The companion lets one write batch through per 500 ms: a little more between two of ours. */
export const WRITE_GAP_MS = 600;
const RETRY_MS = 1100;

/** A failure with the code the app has a sentence for. */
export class CameraFailureError extends Error {
  constructor(readonly failure: CameraFailure) {
    super(failure);
  }
}

const sleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

let tail: Promise<unknown> = Promise.resolve();
let lastWrite = 0;
/** Counts reads and writes: an answer that is older than the last request must not replace a newer one */
let generation = 0;

export const useCameraControls = create<CameraControlsStore>((set, get) => ({
  controls: null,
  error: null,
  loading: false,

  async read() {
    const client = companion();
    if (!client) throw new CameraFailureError('unreachable');
    const mine = ++generation;
    set({ loading: true });
    try {
      const controls = await client.cameraControls();
      if (mine === generation) set({ controls, error: null, loading: false });
      return controls;
    } catch (error) {
      const failure = failureOf(error);
      if (mine === generation) set({ error: failure, loading: false });
      throw new CameraFailureError(failure);
    }
  },

  apply(changes) {
    const job = async () => {
      const client = companion();
      if (!client) throw new CameraFailureError('unreachable');
      const wait = lastWrite + WRITE_GAP_MS - Date.now();
      if (wait > 0) await sleep(wait);
      const mine = ++generation;
      const send = () => {
        lastWrite = Date.now();
        return client.setCameraControls(changes);
      };
      try {
        let answer: CameraControlsAnswer;
        try {
          answer = await send();
        } catch (error) {
          // Another device wrote a moment ago: once more after the time it asked for
          if (failureOf(error) !== 'rate-limited') throw error;
          await sleep(RETRY_MS);
          answer = await send();
        }
        if (mine === generation) set({ controls: answer.controls, error: null });
        return answer;
      } catch (error) {
        throw new CameraFailureError(failureOf(error));
      }
    };
    const next = tail.then(job, job);
    tail = next.catch(() => undefined);
    return next;
  },

  async takeOver() {
    return takeover(await get().read());
  },
}));
