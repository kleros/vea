import pino from "pino";
import envVar from "./envVar";

// TODO: make this env var optional, skip fetch if undefined
const logtailToken = envVar("LOGTAIL_TOKEN");
const transport = pino.transport({
  targets: [
    {
      target: "@logtail/pino",
      options: { sourceToken: logtailToken },
      level: "debug",
    },
    {
      target: "pino-pretty",
      options: {},
      level: "debug",
    },
  ],
});
const logger = pino(
  {
    level: envVar("LOG_LEVEL"), // TODO: set it to info if not defined
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  transport
);

export default logger;
