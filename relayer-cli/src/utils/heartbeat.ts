import https from "https";
/**
 * Sends a heartbeat signal to the monitoring service
 * @param status - The status to send with the heartbeat
 */
export const sendHeartbeat = async (status: string, heartbeatURL: string): Promise<void> => {
  if (!heartbeatURL) {
    return;
  }
  try {
    const url = new URL(heartbeatURL);
    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname,
      method: "GET",
      headers: {
        "User-Agent": "Vea-Validator-CLI/1.0",
      },
    };

    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          resolve();
        });
      });

      req.on("error", (error) => {
        reject(error);
      });

      req.setTimeout(10000, () => {
        req.destroy();
        reject(new Error("Heartbeat request timeout"));
      });

      req.end();
    });
  } catch (error) {
    // Silently fail - heartbeat errors shouldn't affect the main operation
  }
};
