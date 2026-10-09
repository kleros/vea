import { EventEmitter } from "events";
import https from "https";
import { sendHeartbeat } from "./heartbeat";
import { BotEvents } from "./botEvents";

const URL_WITH_TOKEN = "https://uptime.example.com/api/v1/heartbeat/SECRET-TOKEN";

type Behaviour = "ok" | "http500" | "error" | "timeout";

const fakeRequest = (behaviour: Behaviour) =>
  jest.spyOn(https, "request").mockImplementation(((options: any, onResponse: (res: any) => void) => {
    const req = new EventEmitter() as any;
    let onTimeout: (() => void) | undefined;
    req.setTimeout = (_ms: number, cb: () => void) => {
      onTimeout = cb;
    };
    req.destroy = jest.fn();
    req.end = () => {
      setImmediate(() => {
        if (behaviour === "error") {
          req.emit("error", new Error(`getaddrinfo ENOTFOUND ${options.hostname}`));
        } else if (behaviour === "timeout") {
          onTimeout!();
        } else {
          const res = new EventEmitter() as any;
          res.statusCode = behaviour === "ok" ? 200 : 500;
          onResponse(res);
          res.emit("data", "ok");
          res.emit("end");
        }
      });
    };
    return req;
  }) as any);

const capture = () => {
  const emitter = new EventEmitter();
  const failed: any[] = [];
  emitter.on(BotEvents.HEARTBEAT_FAILED, (p) => failed.push(p));
  return { emitter, failed };
};

afterEach(() => jest.restoreAllMocks());

describe("sendHeartbeat", () => {
  it("sends a GET to the URL's host and path and emits nothing on success", async () => {
    const request = fakeRequest("ok");
    const { emitter, failed } = capture();
    await expect(sendHeartbeat("running", URL_WITH_TOKEN, emitter)).resolves.toBeUndefined();
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        hostname: "uptime.example.com",
        path: "/api/v1/heartbeat/SECRET-TOKEN?status=up&msg=running",
        method: "GET",
      })
    );
    expect(failed).toEqual([]);
  });

  it("a running beat on ?status=up&msg=OK&ping= sends status=up&msg=running&ping=, keeping every token", async () => {
    const request = fakeRequest("ok");
    await sendHeartbeat(
      "running",
      "https://kuma.example.com/api/push/TOKEN?status=up&msg=OK&ping=",
      new EventEmitter()
    );
    expect((request.mock.calls[0][0] as any).path).toBe("/api/push/TOKEN?status=up&msg=running&ping=");
  });

  it("a stop on ?status=up&msg=OK&ping= sends status=down&msg=stopped&ping=", async () => {
    const request = fakeRequest("ok");
    await sendHeartbeat(
      "stopped",
      "https://kuma.example.com/api/push/TOKEN?status=up&msg=OK&ping=",
      new EventEmitter()
    );
    expect((request.mock.calls[0][0] as any).path).toBe("/api/push/TOKEN?status=down&msg=stopped&ping=");
  });

  it("started is up, and other query tokens keep their order and values", async () => {
    const request = fakeRequest("ok");
    await sendHeartbeat(
      "started",
      "https://kuma.example.com/api/push/TOKEN?a=1&status=down&b=x%20y",
      new EventEmitter()
    );
    expect((request.mock.calls[0][0] as any).path).toBe("/api/push/TOKEN?a=1&status=up&b=x+y&msg=started");
  });

  it("does nothing without a URL", async () => {
    const request = fakeRequest("ok");
    await sendHeartbeat("started", undefined);
    await sendHeartbeat("started", "");
    expect(request).not.toHaveBeenCalled();
  });

  it.each<Behaviour>(["timeout", "error", "http500"])(
    "a %s resolves, emits HEARTBEAT_FAILED and never rejects",
    async (behaviour) => {
      fakeRequest(behaviour);
      const { emitter, failed } = capture();
      const unhandled = jest.fn();
      process.on("unhandledRejection", unhandled);
      try {
        await expect(sendHeartbeat("stopped", URL_WITH_TOKEN, emitter)).resolves.toBeUndefined();
        await new Promise((r) => setImmediate(r));
      } finally {
        process.off("unhandledRejection", unhandled);
      }
      expect(unhandled).not.toHaveBeenCalled();
      expect(failed).toEqual([{ status: "stopped", message: expect.any(String) }]);
      expect(failed[0].message).not.toContain("SECRET-TOKEN");
    }
  );

  it("an unparseable URL emits HEARTBEAT_FAILED instead of throwing", async () => {
    const { emitter, failed } = capture();
    await expect(sendHeartbeat("started", "not a url", emitter)).resolves.toBeUndefined();
    expect(failed).toHaveLength(1);
    expect(failed[0].message).not.toContain("not a url");
  });
});
