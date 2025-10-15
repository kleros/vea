export const dispatchAbi = [
  "function dispatchMessageToAdapters(uint256 targetChainId,uint256 threshold,address receiver,bytes data,address[] reporters,address[] adapters)",
];

export const messageDispatchedAbi = [
  "event MessageDispatched(uint256 indexed messageId, (uint256 nonce,uint256 targetChainId,uint256 threshold,address sender,address receiver,bytes data,address[] reporters,address[] adapters) message)",
];

export const thresholdViewAbi = [
  "function checkHashWithThresholdFromAdapters(uint256 domain,uint256 id,uint256 threshold,address[] adapters) view returns (bool)",
];

export const executeMessagesAbi = [
  "function executeMessages((uint256,uint256,uint256,address,address,bytes,address[],address[])[] messages) external returns (bytes[])",
];
