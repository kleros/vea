export class NetworkConfigNotSet extends Error {
  constructor() {
    super();
    this.name = "NetworkConfigNotSet";
    this.message = `No valid network configuration found for the relayer, check the environment variables`;
  }
}
