import { relayAllFrom } from "./utils/relay";

require("dotenv").config();

(async () => {
  let nonceGnosis = 0;
  let nonceChiado = 0;
  while (1) {
    await relayAllFrom(5, 0, "0xe6aC8CfF97199A67b8121a3Ce3aC98772f90B94b");
    await relayAllFrom(10200, 0, "0x177AfBF3cda970024Efa901516735aF9c3B894a4");
    await delay(Date.now() % (30 * 60 * 1000)); // wait 30 minutes
  }
})();

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
