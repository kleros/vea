import type { CodegenConfig } from "@graphql-codegen/cli";

const config: CodegenConfig = {
  overwrite: true,
  schema: [
    "https://api.thegraph.com/subgraphs/name/alcercu/veascantest",
    "https://api.thegraph.com/subgraphs/name/alcercu/veascan-outbox-goerli",
  ],
  documents: "src/hooks/queries/*.ts",
  generates: {
    "src/gql/": {
      preset: "client",
      plugins: [],
    },
    "generated/graphql.schema.json": {
      plugins: ["introspection"],
    },
  },
};

export default config;
