import type { CodegenConfig } from "@graphql-codegen/cli";

const config: CodegenConfig = {
  overwrite: true,
  schema: [
    `https://api.studio.thegraph.com/query/${process.env.VEASCAN_INBOX_SUBGRAPH}`,
    `https://api.studio.thegraph.com/query/${process.env.VEASCAN_OUTBOX_SUBGRAPH}`,
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
