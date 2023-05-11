module.exports = {
  apps: [
    {
      name: "devnet",
      script: "yarn",
      args: "start-devnet",
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
