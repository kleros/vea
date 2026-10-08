import { EventEmitter } from "events";
import { ShutdownSignal, installShutdownHandlers } from "../../utils/shutdown";
import { BotEvents } from "../../utils/botEvents";

describe("ShutdownSignal (PRD 4.7)", () => {
  // Fake timers: these tests never depend on how fast the machine runs.
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const settled = (promise: Promise<void>) => {
    const state = { done: false };
    promise.then(() => (state.done = true));
    return state;
  };

  it("wait() resolves after its delay when nothing happens, not before", async () => {
    const signal = new ShutdownSignal();
    const waiting = settled(signal.wait(30_000));
    await jest.advanceTimersByTimeAsync(29_999);
    expect(waiting.done).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    expect(waiting.done).toBe(true);
  });

  it("setShutdownSignal wakes up every pending wait() at once and clears their timers", async () => {
    const signal = new ShutdownSignal();
    const waits = [settled(signal.wait(60_000)), settled(signal.wait(60_000))];
    await jest.advanceTimersByTimeAsync(10);
    expect(waits.map((w) => w.done)).toEqual([false, false]);
    signal.setShutdownSignal();
    await Promise.resolve();
    await Promise.resolve();
    expect(waits.map((w) => w.done)).toEqual([true, true]);
    expect(jest.getTimerCount()).toBe(0);
    expect(signal.getIsShutdownSignal()).toBe(true);
  });

  it("wait() returns at once once the signal is set", async () => {
    const signal = new ShutdownSignal(true);
    const waiting = settled(signal.wait(60_000));
    await Promise.resolve();
    await Promise.resolve();
    expect(waiting.done).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
  });

  it.each<NodeJS.Signals>(["SIGTERM", "SIGINT"])(
    "%s sets the signal and emits SHUTDOWN_REQUESTED; the handlers can be removed",
    (name) => {
      const before = process.listeners(name);
      const signal = new ShutdownSignal();
      const emitter = new EventEmitter();
      const requested: any[] = [];
      emitter.on(BotEvents.SHUTDOWN_REQUESTED, (p) => requested.push(p));
      const remove = installShutdownHandlers(signal, emitter);
      const added = process.listeners(name).filter((l) => !before.includes(l));
      expect(added).toHaveLength(1);
      // Call the handler directly rather than process.emit, so the test runner's own handlers stay out of it.
      (added[0] as (s: NodeJS.Signals) => void)(name);
      expect(signal.getIsShutdownSignal()).toBe(true);
      expect(requested).toEqual([{ signal: name }]);
      remove();
      expect(process.listeners(name)).toEqual(before);
    }
  );
});
