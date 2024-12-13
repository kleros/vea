export default class ShutdownManager {
  private isShuttingDown: boolean;

  constructor(initialState: boolean = false) {
    this.isShuttingDown = initialState;
  }

  public getIsShuttingDown(): boolean {
    return this.isShuttingDown;
  }

  public triggerShutdown() {
    this.isShuttingDown = true;
  }
}
