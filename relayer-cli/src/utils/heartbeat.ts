import https from "https";

const HEARTBEAT_TIMEOUT_MS = 10000;

/**
 * Sends a heartbeat signal to the monitoring service.
 * Never rejects: heartbeat errors (invalid URL, request error, timeout) must not affect the main operation.
 * @param status - The status to send with the heartbeat
 * @param heartbeatURL - The monitoring URL; an empty URL sends nothing
 */
export const sendHeartbeat = async (status: string, heartbeatURL: string): Promise<void> => {
  if (!heartbeatURL) {
    return;
  }
  let options: https.RequestOptions;
  try {
    const url = new URL(heartbeatURL);
    options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname,
      method: "GET",
      headers: {
        "User-Agent": "Vea-Validator-CLI/1.0",
      },
    };
  } catch (error) {
    // Invalid URL
    return;
  }

  return new Promise<void>((resolve) => {
    try {
      const req = https.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          resolve();
        });
        res.on("error", () => {
          resolve();
        });
      });

      req.on("error", () => {
        resolve();
      });

      req.setTimeout(HEARTBEAT_TIMEOUT_MS, () => {
        req.destroy();
        resolve();
      });

      req.end();
    } catch (error) {
      resolve();
    }
  });
};
