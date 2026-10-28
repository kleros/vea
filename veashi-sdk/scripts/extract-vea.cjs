// Generates veashi-sdk/vea/testnet.json from the hardhat-deploy files in contracts/deployments.
// Run with `yarn extract:vea`. Only `*Testnet` deployments are read; Devnet ones are ignored.
const fs = require("fs");
const path = require("path");

const DEPLOYMENTS_DIR = path.resolve(__dirname, "../../contracts/deployments");
const OUTPUT_FILE = path.resolve(__dirname, "../vea/testnet.json");

// Expected chain id per network; checked against contracts/deployments/<network>/.chainId.
const NETWORK_CHAIN_IDS = {
  arbitrumSepolia: 421614,
  sepolia: 11155111,
  chiado: 10200,
};

// Routes whose outbox is reached through a router on an intermediate chain.
const ROUTES_WITH_ROUTER = new Set(["ArbToGnosis"]);

const FILE_PATTERN = /^(VeaInbox|VeaOutbox|Router)([A-Za-z]+To[A-Za-z]+)Testnet\.json$/;
const ROLES = { VeaInbox: "inbox", VeaOutbox: "outbox", Router: "router" };

function checkChainId(network, dir) {
  const file = path.join(dir, ".chainId");
  if (!fs.existsSync(file)) throw new Error(`${network}: missing ${path.relative(process.cwd(), file)}`);
  const chainId = Number(fs.readFileSync(file, "utf8").trim());
  if (chainId !== NETWORK_CHAIN_IDS[network]) {
    throw new Error(`${network}: .chainId is ${chainId}, expected ${NETWORK_CHAIN_IDS[network]}`);
  }
}

function readDeployments() {
  // route name (e.g. "ArbToEth") -> { inbox, outbox, router }
  const byRoute = {};
  for (const network of Object.keys(NETWORK_CHAIN_IDS).sort()) {
    const dir = path.join(DEPLOYMENTS_DIR, network);
    if (!fs.existsSync(dir)) continue;
    checkChainId(network, dir);
    for (const file of fs.readdirSync(dir).sort()) {
      const match = FILE_PATTERN.exec(file);
      if (!match) continue;
      const [, kind, routeName] = match;
      const role = ROLES[kind];
      const { address } = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
      if (typeof address !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
        throw new Error(`${network}/${file}: missing or invalid address`);
      }
      const route = (byRoute[routeName] = byRoute[routeName] || {});
      if (route[role]) {
        throw new Error(`${routeName}: duplicate ${role} (${route[role].network} and ${network})`);
      }
      route[role] = { address, contract: file.replace(/\.json$/, ""), network };
    }
  }
  return byRoute;
}

function buildRoutes(byRoute) {
  const routes = {};
  for (const routeName of Object.keys(byRoute).sort()) {
    const { inbox, outbox, router } = byRoute[routeName];
    if (!inbox || !outbox) continue;

    const needsRouter = ROUTES_WITH_ROUTER.has(routeName);
    if (needsRouter && !router) throw new Error(`${routeName}: route needs a router but has no testnet router`);
    if (!needsRouter && router) throw new Error(`${routeName}: unexpected router; add the route to ROUTES_WITH_ROUTER`);

    const key = `${NETWORK_CHAIN_IDS[inbox.network]}-${NETWORK_CHAIN_IDS[outbox.network]}`;
    if (routes[key]) throw new Error(`${key}: more than one testnet route`);
    routes[key] = router ? { inbox, outbox, router } : { inbox, outbox };
  }
  return routes;
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortKeys(value[key])])
    );
  }
  return value;
}

const routes = sortKeys(buildRoutes(readDeployments()));
fs.writeFileSync(OUTPUT_FILE, JSON.stringify(routes, null, 2) + "\n");
console.log(
  `✅ Wrote ${Object.keys(routes).length} Vea testnet routes to ${path.relative(process.cwd(), OUTPUT_FILE)}`
);
