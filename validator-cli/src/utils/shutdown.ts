/**
 * A class to represent a shutdown signal.
 */
export class ShutdownSignal {
  private isShutdownSignal: boolean;

  constructor(initialState: boolean = false) {
    this.isShutdownSignal = initialState;
  }

  public getIsShutdownSignal(): boolean {
    return this.isShutdownSignal;
  }

  public setShutdownSignal(): void {
    this.isShutdownSignal = true;
  }
}
