module.exports = {
  apps: [
    {
      name: "watcher",
      script: "yarn",
      args: "start",
      interpreter: "/bin/bash",
      log_date_format: "YYYY-MM-DD HH:mm Z",
      watch: false,
      autorestart: false,
      cron_restart: "* * * * *",
      env: {
        NODE_ENV: "development",
      },
    },
  ],
};
