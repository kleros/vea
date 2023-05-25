import VeaSdk from "../src/index";
import envVar from "../src/utils/envVar";

const sdk = VeaSdk.configureArbitrumGoerliToChiadoDevnet(envVar("RPC_ARB_GOERLI"), envVar("RPC_CHIADO"));

sdk.bridge.inbox(); // returns VeaInboxArbToXxx
sdk.bridge.outbox(); // returns VeaOutboxArbToXxx
