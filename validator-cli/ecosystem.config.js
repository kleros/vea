module.exports = {
  apps: [
    {
      name: "chiado-devnet",
      script: "yarn",
      args: "start-chiado-devnet",
      interpreter: "/bin/bash",
      log_date_format: "YYYY-MM-DD HH:mm Z",
      watch: false,
      autorestart: false,
      env: {
        NODE_ENV: "development",
      },
    },
    {
      name: "start-sepolia-devnet",
      script: "yarn",
      args: "start-sepolia-devnet",
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
