import { getBotPath, BotPaths, getNetworkConfig, splitList } from "./botConfig";
import { InvalidBotPathError } from "./errors";
import { Network } from "../consts/bridgeRoutes";
describe("cli", () => {
  describe("getBotPath", () => {
    const defCommand = ["yarn", "start"];
    it("should return the default path", () => {
      const config = getBotPath({ cliCommand: defCommand });
      expect(config.path).toEqual(BotPaths.BOTH);
    });
    it("should return the claimer path", () => {
      const command = ["yarn", "start", "--path=claimer"];
      const config = getBotPath({ cliCommand: command });
      expect(config.path).toEqual(BotPaths.CLAIMER);
    });
    it("should return the challenger path", () => {
      const command = ["yarn", "start", "--path=challenger"];
      const config = getBotPath({ cliCommand: command });
      expect(config.path).toEqual(BotPaths.CHALLENGER);
    });
    it("should throw an error for invalid path", () => {
      const command = ["yarn", "start", "--path=invalid"];
      expect(() => getBotPath({ cliCommand: command })).toThrow(new InvalidBotPathError());
    });
  });

  describe("getNetworkConfig", () => {
    const saved = { chains: process.env.VEAOUTBOX_CHAINS, networks: process.env.NETWORKS };
    afterEach(() => {
      process.env.VEAOUTBOX_CHAINS = saved.chains;
      process.env.NETWORKS = saved.networks;
    });

    it("reads the lists the preflight accepts: spaces, a trailing comma, a leading zero", () => {
      process.env.VEAOUTBOX_CHAINS = " 11155111, 010200 ,";
      process.env.NETWORKS = "devnet, testnet,";
      expect(getNetworkConfig()).toEqual([
        { chainId: 11155111, networks: [Network.DEVNET, Network.TESTNET] },
        { chainId: 10200, networks: [Network.DEVNET, Network.TESTNET] },
      ]);
    });

    it("runs a chain or network listed twice once", () => {
      process.env.VEAOUTBOX_CHAINS = "11155111,11155111";
      process.env.NETWORKS = "testnet,testnet";
      expect(getNetworkConfig()).toEqual([{ chainId: 11155111, networks: [Network.TESTNET] }]);
    });

    it("splitList trims and drops empty entries", () => {
      expect(splitList(" a, ,b,")).toEqual(["a", "b"]);
      expect(splitList(undefined)).toEqual([]);
    });
  });
});
