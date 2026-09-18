/**
 * A tiny typed event bus.
 *
 * Entities announce what happened ("I was collected", "the player was hit")
 * without knowing who cares. The Game listens and updates score, lives and the
 * HUD. This is what keeps entities from importing the Game and creating a
 * tangle — add a new event below and anything can subscribe to it.
 */

export interface GameEvents {
  /** A pickup was collected. */
  collect: { itemId: string; label: string; points: number };
  /** Points were awarded from any source. */
  score: { amount: number; reason: string };
  /** Lives were gained or lost. */
  life: { amount: number };
  /** Seconds were added to (or taken off) the clock. */
  time: { seconds: number };
  /** An enemy was defeated. */
  defeat: { enemyId: string; points: number };
  /** The player took a hit (from an enemy, a hazard, or a fall). */
  hurt: { cause: string };
  /** A timed power-up started or ended. */
  effect: { name: string; active: boolean; duration: number };
  /** The player reached the goal portal. */
  goal: Record<string, never>;
  /** The player ran out of lives. */
  dead: Record<string, never>;
}

type Handler<K extends keyof GameEvents> = (payload: GameEvents[K]) => void;

export class EventBus {
  private handlers = new Map<keyof GameEvents, Set<Handler<never>>>();

  on<K extends keyof GameEvents>(event: K, handler: Handler<K>): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler as Handler<never>);
    return () => set!.delete(handler as Handler<never>);
  }

  emit<K extends keyof GameEvents>(event: K, payload: GameEvents[K]): void {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const handler of set) (handler as Handler<K>)(payload);
  }

  clear(): void {
    this.handlers.clear();
  }
}
