import type { CodegenConfig } from "@graphql-codegen/cli";

const config: CodegenConfig = {
  overwrite: true,
  schema: [
    "https://api.studio.thegraph.com/query/67213/veascan-inbox-arb-sep-devnet/version/latest",
    "https://api.studio.thegraph.com/query/67213/veascan-outbox-arb-sep-devnet/version/latest",
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
