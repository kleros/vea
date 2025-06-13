import { getBotPath, BotPaths } from "./botConfig";
import { InvalidBotPathError } from "./errors";
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
});
