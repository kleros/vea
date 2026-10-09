import https from "https";
import { EventEmitter } from "node:events";
import { BotEvents } from "./botEvents";
import { defaultEmitter } from "./emitter";

const HEARTBEAT_TIMEOUT_MS = 10000;

const redact = (message: string, heartbeatURL: string): string => {
  let out = message.split(heartbeatURL).join("<heartbeat-url>");
  try {
    const url = new URL(heartbeatURL);
    for (const secret of [url.href, url.pathname + url.search, url.pathname, url.search]) {
      if (secret && secret !== "/" && secret !== "?") out = out.split(secret).join("<heartbeat-url>");
    }
  } catch {
    // an unparseable URL was already removed verbatim above
  }
  return out;
};

/**
 * Sends a heartbeat signal to the monitoring service.
 *
 * Never throws or rejects: a failure emits `HEARTBEAT_FAILED` and returns, since heartbeat
 * errors must not affect the main operation. The status reaches the monitor in the query, in the
 * Uptime Kuma push form (`?status=up|down&msg=...&ping=`): `status=up` for `started` and `running`,
 * `status=down` for `stopped`, and the bot state in `msg`. Both are set with `URLSearchParams.set`
 * (replacing any existing value); every other query token is kept. A monitor that ignores the
 * query sees every call, `stopped` included, as a liveness ping.
 *
 * @param status - The status this heartbeat stands for (`started`, `running`, `stopped`)
 * @param heartbeatURL - The monitor URL; nothing is sent when empty
 * @param emitter - Receives `HEARTBEAT_FAILED`
 */
export const sendHeartbeat = async (
  status: string,
  heartbeatURL: string | undefined,
  emitter: EventEmitter = defaultEmitter
): Promise<void> => {
  if (!heartbeatURL) {
    return;
  }
  try {
    const url = new URL(heartbeatURL);
    url.searchParams.set("status", status === "stopped" ? "down" : "up");
    url.searchParams.set("msg", status);
    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method: "GET",
      headers: {
        "User-Agent": "Vea-Validator-CLI/1.0",
      },
    };

    await new Promise<void>((resolve, reject) => {
      const req = https.request(options, (res) => {
        res.on("data", () => {});
        res.on("end", () => {
          const code = res.statusCode ?? 0;
          if (code >= 400) reject(new Error(`Heartbeat responded with HTTP ${code}`));
          else resolve();
        });
        res.on("error", reject);
      });

      req.on("error", (error) => {
        reject(error);
      });

      req.setTimeout(HEARTBEAT_TIMEOUT_MS, () => {
        req.destroy();
        reject(new Error("Heartbeat request timeout"));
      });

      req.end();
    });
  } catch (error) {
    // The message never carries the URL itself: it may hold the monitor's token.
    const message = error instanceof Error ? error.message : String(error);
    emitter.emit(BotEvents.HEARTBEAT_FAILED, { status, message: redact(message, heartbeatURL) });
  }
};
