type Listener<T, X> = (payload: T, extra: X) => void;

/** What an event passes as its second argument (`undefined` for the events that pass none). */
type ExtraOf<Extras, K> = K extends keyof Extras ? Extras[K] : undefined;

/**
 * Minimal typed event emitter (works in browser and Node). An event may pass a second argument
 * (`Extras` names its type per event); a listener that does not ask for it is not told it exists.
 */
export class Emitter<Events extends object, Extras extends object = Record<never, never>> {
  private listeners = new Map<keyof Events, Set<Listener<never, never>>>();

  on<K extends keyof Events>(
    event: K,
    listener: Listener<Events[K], ExtraOf<Extras, K>>,
  ): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener as Listener<never, never>);
    return () => set.delete(listener as Listener<never, never>);
  }

  protected emit<K extends keyof Events>(
    event: K,
    payload: Events[K],
    extra?: ExtraOf<Extras, K>,
  ): void {
    for (const listener of this.listeners.get(event) ?? [])
      (listener as Listener<Events[K], ExtraOf<Extras, K> | undefined>)(payload, extra);
  }
}
