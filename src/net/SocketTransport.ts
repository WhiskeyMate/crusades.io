// Turns from the game server, for a Session. The Online client owns the
// socket and hands turns here; this just queues them until the session is
// listening and forwards intents the other way.

import { Intent, Turn } from "@vassal/engine-api/Schemas";
import { Transport, TURN_MS } from "./Transport";

export class SocketTransport implements Transport {
  onTurn: (turn: Turn) => void = () => {};
  readonly ownsClock = false;
  private queue: Turn[] = [];
  private running = false;

  constructor(private sendIntent: (i: Intent) => void) {}

  /** From the Online client, in order. */
  push(turn: Turn) {
    if (this.running) this.onTurn(turn);
    else this.queue.push(turn);
  }

  send(intent: Intent) {
    this.sendIntent(intent);
  }

  start() {
    this.running = true;
    for (const t of this.queue) this.onTurn(t);
    this.queue = [];
  }

  stop() {
    this.running = false;
  }

  turnMs() {
    return TURN_MS;
  }
}
