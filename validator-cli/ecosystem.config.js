module.exports = {
  apps: [
    {
      name: "validator-cli",
      script: "./src/watcher.ts",
      interpreter: "../node_modules/.bin/ts-node",
      interpreter_args: "--project tsconfig.json -r tsconfig-paths/register",
      log_date_format: "YYYY-MM-DD HH:mm Z",
      watch: false,
      autorestart: false,
      env: {
        NODE_ENV: "development",
        TS_NODE_PROJECT: "./tsconfig.json",
      },
    },
  ],
};
