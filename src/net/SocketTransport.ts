// Turns from the game server, for a Session. The Online client owns the
// socket and hands turns here; this just queues them until the session is
// listening and forwards intents the other way.

import { Intent, Turn } from "@crusades/engine-api/Schemas";
import { Transport, TURN_MS } from "./Transport";

export class SocketTransport implements Transport {
  onTurn: (turn: Turn) => void = () => {};
  readonly ownsClock = false;
  /**
   * Whether the session can take another turn right now. A player who joins
   * late, or comes back after a drop, has thousands of turns to replay; fed
   * all at once they bury the page for minutes. The session sets this so the
   * backlog goes in only as fast as the engine clears it.
   */
  ready: () => boolean = () => true;
  private queue: Turn[] = [];
  private head = 0;
  private running = false;
  private pump = 0;

  constructor(private sendIntent: (i: Intent) => void) {}

  /** Turns waiting to be played (the catch-up a late starter has to do). */
  get queued(): number {
    return this.queue.length - this.head;
  }

  /** From the Online client, in order. */
  push(turn: Turn) {
    this.queue.push(turn);
    if (this.running) this.drain();
  }

  send(intent: Intent) {
    this.sendIntent(intent);
  }

  start() {
    this.running = true;
    this.drain();
  }

  stop() {
    this.running = false;
    window.clearTimeout(this.pump);
    this.pump = 0;
  }

  turnMs() {
    return TURN_MS;
  }

  private drain() {
    let sent = 0;
    while (this.head < this.queue.length && sent < 80 && this.ready()) {
      this.onTurn(this.queue[this.head++]);
      sent++;
    }
    if (this.head >= this.queue.length) {
      this.queue = [];
      this.head = 0;
    } else if (!this.pump && this.running) {
      // More to play than the engine will take now: come back shortly.
      this.pump = window.setTimeout(() => {
        this.pump = 0;
        if (this.running) this.drain();
      }, 25);
    }
  }
}
