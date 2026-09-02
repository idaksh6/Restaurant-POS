/**
 * PM2 process for mesa-api on CyberPanel.
 * Loads mesa-api/.env so DATABASE_URL is available at runtime.
 */
const fs = require('fs')
const path = require('path')

const apiDir = path.join(__dirname, '../../mesa-api')
const envPath = path.join(apiDir, '.env')
const env = { NODE_ENV: 'production' }

if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const value = trimmed.slice(eq + 1).trim()
    if (key) env[key] = value
  }
}

module.exports = {
  apps: [
    {
      name: 'mesa-api',
      cwd: apiDir,
      script: 'dist/main.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '512M',
      env,
    },
  ],
}
