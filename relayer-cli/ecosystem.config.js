module.exports = {
  apps: [
    {
      name: "devnet-relayer",
      script: "yarn",
      args: "start-devnet-relayer",
      interpreter: "/bin/bash",
      log_date_format: "YYYY-MM-DD HH:mm Z",
      watch: false,
      autorestart: false,
      env: {
        NODE_ENV: "development",
      },
    },
  ],
};
