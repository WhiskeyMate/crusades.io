// Where turns come from. The simulation is lockstep: every client runs the
// same engine and feeds it the same turns in the same order, so the only
// thing that has to be shared is the turn stream. Single-player makes its own
// (LocalTransport); multiplayer will take it from a relay server over a
// socket. Session talks to this interface and does not care which.

import { Intent, Turn } from "@vassal/engine-api/Schemas";

export interface Transport {
  /** Each turn, in order. Set by the session before start(). */
  onTurn: (turn: Turn) => void;
  /** The local player wants to do something; it will come back in a turn. */
  send(intent: Intent): void;
  start(): void;
  stop(): void;
  /** Milliseconds of wall clock per turn right now (for interpolation). */
  turnMs(): number;
  /** Whether this client may pause and change speed (only when playing alone). */
  readonly ownsClock: boolean;
}

export const TURN_MS = 100;

export interface LocalClock {
  speed: number;
  paused: boolean;
}

/** The single-player "server": a clock that stamps and bundles your intents. */
export class LocalTransport implements Transport, LocalClock {
  onTurn: (turn: Turn) => void = () => {};
  readonly ownsClock = true;
  speed = 1;
  paused = false;

  private pending: Intent[] = [];
  private turn = 0;
  private acc = 0;
  private last = 0;
  private timer = 0;

  /**
   * @param clientID stamped on every intent
   * @param ready false while the engine is still behind: hold the clock
   * @param hold true to freeze time (waiting for the player to pick a seat)
   */
  constructor(
    private clientID: string,
    private ready: () => boolean,
    private hold: () => boolean,
  ) {}

  send(intent: Intent) {
    this.pending.push(intent);
  }

  start() {
    this.last = performance.now();
    this.timer = window.setInterval(() => this.pump(), 25);
  }

  stop() {
    window.clearInterval(this.timer);
  }

  turnMs() {
    return TURN_MS / this.speed;
  }

  private pump() {
    const now = performance.now();
    const dt = Math.min(500, now - this.last);
    this.last = now;
    if (this.paused) return;
    // An intent in hand always goes out, even while time is held: it may be
    // the very thing the hold is waiting for.
    if (this.hold() && this.pending.length === 0) {
      this.acc = 0;
      return;
    }
    this.acc += dt * this.speed;
    while (this.acc >= TURN_MS && this.ready()) {
      this.acc -= TURN_MS;
      const intents = this.pending.map((i) => ({ ...i, clientID: this.clientID }));
      this.pending = [];
      this.onTurn({ turnNumber: this.turn++, intents });
    }
    if (this.acc > TURN_MS * 3) this.acc = TURN_MS * 3;
  }
}
