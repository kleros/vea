module.exports = {
  apps: [
    {
      name: "vea-relayer",
      script: "./src/relayer.ts",
      interpreter: "../node_modules/.bin/ts-node",
      interpreter_args: "--project tsconfig.json -r tsconfig-paths/register",
      cwd: process.cwd(),
      env: {
        TS_NODE_PROJECT: "./tsconfig.json",
      },
    },
  ],
};
