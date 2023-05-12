module.exports = {
  apps: [
    {
      name: "chiado-devnet",
      script: "yarn",
      args: "start-chiado-devnet",
      interpreter: "/bin/bash",
      log_date_format: "YYYY-MM-DD HH:mm Z",
      watch: false,
      autorestart: true,
      env: {
        NODE_ENV: "development",
      },
    },
    {
      name: "start-goerli-devnet",
      script: "yarn",
      args: "start-goerli-devnet",
      interpreter: "/bin/bash",
      log_date_format: "YYYY-MM-DD HH:mm Z",
      watch: false,
      autorestart: true,
      env: {
        NODE_ENV: "development",
      },
    },
  ],
};
