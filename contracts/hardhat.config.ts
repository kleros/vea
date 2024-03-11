import * as dotenv from "dotenv";

import { HardhatUserConfig } from "hardhat/config";
import "@nomiclabs/hardhat-ethers";
import "@typechain/hardhat";
import "hardhat-deploy-tenderly";
import "hardhat-gas-reporter";
import "solidity-coverage";
import "hardhat-deploy";
import "hardhat-deploy-ethers";
import "hardhat-watcher";
import "hardhat-docgen";
import "hardhat-contract-sizer";
import "hardhat-tracer";

dotenv.config();

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.18",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  paths: {
    sources: "./src",
  },
  networks: {
    hardhat: {
      live: false,
      saveDeployments: true,
      allowUnlimitedContractSize: true,
      tags: ["test", "local"],
    },
    localhost: {
      url: `http://127.0.0.1:8545`,
      chainId: 31337,
      saveDeployments: true,
      tags: ["test", "local"],
      companionNetworks: {
        receiver: "localhost",
      },
    },
    mainnetFork: {
      url: `http://127.0.0.1:8545`,
      chainId: 1,
      forking: {
        url: `https://mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`,
      },
      accounts: process.env.MAINNET_PRIVATE_KEY !== undefined ? [process.env.MAINNET_PRIVATE_KEY] : [],
      live: false,
      saveDeployments: false,
      tags: ["test", "local"],
    },

    // INBOX ---------------------------------------------------------------------------------------
    arbitrumSepolia: {
      chainId: 421614,
      url: "https://sepolia-rollup.arbitrum.io/rpc",
      accounts: process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
      live: true,
      saveDeployments: true,
      tags: ["staging", "inbox", "layer2"],
      companionNetworks: {
        sepolia: "sepolia",
        chiado: "chiado",
      },
      verify: {
        etherscan: {
          apiUrl: "https://api-sepolia.arbiscan.io",
          apiKey: process.env.ARBISCAN_API_KEY,
        },
      },
    },
    arbitrum: {
      chainId: 42161,
      url: "https://arb1.arbitrum.io/rpc",
      accounts: process.env.MAINNET_PRIVATE_KEY !== undefined ? [process.env.MAINNET_PRIVATE_KEY] : [],
      live: true,
      saveDeployments: true,
      tags: ["production", "inbox", "layer2"],
      companionNetworks: {
        mainnet: "mainnet",
        gnosischain: "gnosischain",
      },
      verify: {
        etherscan: {
          apiUrl: "https://api.arbiscan.io/api",
          apiKey: process.env.ARBISCAN_API_KEY,
        },
      },
    },
    // OUTBOX ---------------------------------------------------------------------------------------
    chiado: {
      chainId: 10200,
      url: "https://rpc.chiadochain.net",
      accounts: process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
      live: true,
      saveDeployments: true,
      tags: ["staging", "outbox", "layer1"],
      companionNetworks: {
        arbitrumSepolia: "arbitrumSepolia",
      },
      verify: {
        etherscan: {
          apiUrl: "https://gnosis-chiado.blockscout.com",
        },
      },
    },
    gnosischain: {
      chainId: 100,
      url: "https://rpc.gnosischain.net",
      accounts: process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
      live: true,
      saveDeployments: true,
      tags: ["staging", "outbox", "layer1"],
      companionNetworks: {
        arbitrumSepolia: "arbitrumSepolia",
      },
      verify: {
        etherscan: {
          apiUrl: "https://blockscout.com/gnosis",
        },
      },
    },
    sepolia: {
      chainId: 11155111,
      url: `https://sepolia.infura.io/v3/${process.env.INFURA_API_KEY}`,
      accounts: process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
      live: true,
      saveDeployments: true,
      tags: ["staging", "outbox", "layer1"],
      companionNetworks: {
        arbitrumSepolia: "arbitrumSepolia",
        chiado: "chiado",
      },
    },
    mainnet: {
      chainId: 1,
      url: `https://mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`,
      accounts: process.env.MAINNET_PRIVATE_KEY !== undefined ? [process.env.MAINNET_PRIVATE_KEY] : [],
      live: true,
      saveDeployments: true,
      tags: ["production", "outbox", "layer1"],
      companionNetworks: {
        arbitrum: "arbitrum",
        gnosischain: "gnosischain",
      },
    },
  },
  namedAccounts: {
    deployer: {
      default: 0,
    },
    relayer: {
      default: 1,
    },
    bridger: {
      default: 2,
    },
    challenger: {
      default: 3,
    },
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined ? process.env.REPORT_GAS === "true" : false,
    currency: "USD",
  },
  verify: {
    etherscan: {
      apiKey: process.env.ETHERSCAN_API_KEY_FIX,
    },
  },
  watcher: {
    compilation: {
      tasks: ["compile"],
      files: ["./contracts"],
      verbose: true,
    },
    testArbitration: {
      tasks: [
        { command: "compile", params: { quiet: true } },
        { command: "test", params: { noCompile: true, testFiles: ["./test/arbitration/index.ts"] } },
      ],
      files: ["./test/**/*", "./src/**/*"],
    },
  },
  docgen: {
    path: "./docs",
    clear: true,
    runOnCompile: false,
  },
  tenderly: {
    project: process.env.TENDERLY_PROJECT !== undefined ? process.env.TENDERLY_PROJECT : "kleros-v2",
    username: process.env.TENDERLY_USERNAME !== undefined ? process.env.TENDERLY_USERNAME : "",
  },
};

export default config;
