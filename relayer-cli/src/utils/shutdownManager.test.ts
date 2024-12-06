import ShutdownManager from "./shutdownManager";

describe("ShutdownManager", () => {
  describe("constructor", () => {
    it("should create a new instance", () => {
      const instance = new ShutdownManager();
      expect(instance).toBeInstanceOf(ShutdownManager);
    });

    it("should set isShuttingDown to the provided value", () => {
      const instance = new ShutdownManager(true);
      expect(instance["isShuttingDown"]).toBe(true);
    });

    it("should set isShuttingDown to false if no value is provided", () => {
      const instance = new ShutdownManager();
      expect(instance["isShuttingDown"]).toBe(false);
    });
  });

  describe("getIsShuttingDown", () => {
    it("should return true when isShuttingDown is true", () => {
      const instance = new ShutdownManager(true);
      expect(instance.getIsShuttingDown()).toBe(true);
    });

    it("should return true when isShuttingDown is false", () => {
      const instance = new ShutdownManager(false);
      expect(instance.getIsShuttingDown()).toBe(false);
    });
  });

  describe("triggerShutdown", () => {
    it.todo("should set isShuttingDown to true");
  });
});
