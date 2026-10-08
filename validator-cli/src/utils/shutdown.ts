import { EventEmitter } from "events";
import { BotEvents } from "./botEvents";

/**
 * A class to represent a shutdown signal.
 */
export class ShutdownSignal {
  private isShutdownSignal: boolean;
  private waiters = new Set<() => void>();

  constructor(initialState: boolean = false) {
    this.isShutdownSignal = initialState;
  }

  public getIsShutdownSignal(): boolean {
    return this.isShutdownSignal;
  }

  public setShutdownSignal(): void {
    this.isShutdownSignal = true;
    for (const wake of [...this.waiters]) wake();
  }

  /**
   * Sleep for `ms`, waking up early (and at once if already set) when the signal is set.
   */
  public wait(ms: number): Promise<void> {
    if (this.isShutdownSignal) return Promise.resolve();
    return new Promise((resolve) => {
      const wake = () => {
        clearTimeout(timer);
        this.waiters.delete(wake);
        resolve();
      };
      const timer = setTimeout(wake, ms);
      this.waiters.add(wake);
    });
  }
}

const SHUTDOWN_SIGNALS: NodeJS.Signals[] = ["SIGTERM", "SIGINT"];

/**
 * Set `shutdownSignal` on SIGTERM and SIGINT, emitting `SHUTDOWN_REQUESTED`.
 *
 * @returns A function that removes the handlers again
 */
export const installShutdownHandlers = (shutdownSignal: ShutdownSignal, emitter: EventEmitter): (() => void) => {
  const onSignal = (signal: NodeJS.Signals) => {
    emitter.emit(BotEvents.SHUTDOWN_REQUESTED, { signal });
    shutdownSignal.setShutdownSignal();
  };
  for (const signal of SHUTDOWN_SIGNALS) process.on(signal, onSignal);
  return () => {
    for (const signal of SHUTDOWN_SIGNALS) process.off(signal, onSignal);
  };
};
