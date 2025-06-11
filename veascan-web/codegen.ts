import type { CodegenConfig } from "@graphql-codegen/cli";

const config: CodegenConfig = {
  overwrite: true,
  schema: [
    `https://api.studio.thegraph.com/query/${process.env.VEASCAN_INBOX_SUBGRAPH_ARBSEPOLIA}`,
    `https://api.studio.thegraph.com/query/${process.env.VEASCAN_OUTBOX_SUBGRAPH_CHIADO}`,
    `https://api.studio.thegraph.com/query/${process.env.VEASCAN_OUTBOX_SUBGRAPH_SEPOLIA}`,
  ],
  documents: "src/hooks/queries/*.ts",
  generates: {
    "./src/gql/": {
      preset: "client",
      plugins: [],
    },
  },
};

export default config;
