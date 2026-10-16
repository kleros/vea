import https from "https";
import { EventEmitter } from "events";
import { sendHeartbeat } from "./heartbeat";

class FakeRequest extends EventEmitter {
  timeoutCallback?: () => void;
  setTimeout = jest.fn((_ms: number, callback: () => void) => {
    this.timeoutCallback = callback;
    return this;
  });
  end = jest.fn();
  destroy = jest.fn();
}

// Lets pending promise callbacks run, without timers
const flushPromises = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

describe("sendHeartbeat", () => {
  const heartbeatURL = "https://heartbeat.test/ping/abc";
  let req: FakeRequest;
  let onResponse: ((res: EventEmitter) => void) | undefined;
  let requestSpy: jest.SpyInstance;

  beforeEach(() => {
    req = new FakeRequest();
    onResponse = undefined;
    requestSpy = jest.spyOn(https, "request").mockImplementation(((_options: unknown, callback: any) => {
      onResponse = callback;
      return req;
    }) as any);
  });

  afterEach(() => {
    requestSpy.mockRestore();
  });

  it("F5.a: resolves on a request error", async () => {
    const result = sendHeartbeat("running", heartbeatURL);
    req.emit("error", Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }));
    await expect(result).resolves.toBeUndefined();
  });

  it("F5.b: resolves and destroys the request when the timeout fires", async () => {
    const result = sendHeartbeat("running", heartbeatURL);
    expect(req.setTimeout).toHaveBeenCalledWith(10000, expect.any(Function));
    req.timeoutCallback!();
    await expect(result).resolves.toBeUndefined();
    expect(req.destroy).toHaveBeenCalledTimes(1);
  });

  it("F5.c: resolves on an invalid URL", async () => {
    await expect(sendHeartbeat("running", "not a url")).resolves.toBeUndefined();
    expect(requestSpy).not.toHaveBeenCalled();
  });

  it("F5.c: resolves without a request on an empty URL", async () => {
    await expect(sendHeartbeat("running", "")).resolves.toBeUndefined();
    expect(requestSpy).not.toHaveBeenCalled();
  });

  it("F5.d: resolves once the response ends", async () => {
    let settled = false;
    const result = sendHeartbeat("running", heartbeatURL).then(() => {
      settled = true;
    });
    expect(requestSpy).toHaveBeenCalledWith(
      expect.objectContaining({ hostname: "heartbeat.test", path: "/ping/abc", method: "GET" }),
      expect.any(Function)
    );
    expect(req.end).toHaveBeenCalledTimes(1);
    const res = new EventEmitter();
    onResponse!(res);
    res.emit("data", "ok");
    await flushPromises();
    expect(settled).toBe(false);
    res.emit("end");
    await result;
    expect(settled).toBe(true);
  });

  it("resolves on a response error", async () => {
    const result = sendHeartbeat("running", heartbeatURL);
    const res = new EventEmitter();
    onResponse!(res);
    res.emit("error", new Error("aborted"));
    await expect(result).resolves.toBeUndefined();
  });

  it("resolves when the request cannot be created", async () => {
    requestSpy.mockImplementation(() => {
      throw new Error("bad options");
    });
    await expect(sendHeartbeat("running", heartbeatURL)).resolves.toBeUndefined();
  });
});
