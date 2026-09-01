/**
 * PM2 process for mesa-api on CyberPanel.
 * Usage from repo root:
 *   pm2 start deploy/cyberpanel/ecosystem.config.cjs
 */
module.exports = {
  apps: [
    {
      name: 'mesa-api',
      cwd: './mesa-api',
      script: 'dist/main.js',
      instances: 1,
      autorestart: true,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
}
