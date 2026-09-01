import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const unpacked = path.join(root, 'release', 'win-unpacked')
const staging = path.join(root, 'release', 'staging')
const folderName = 'Mesa-POS'
const stagedApp = path.join(staging, folderName)
const dest = path.join(root, 'release', `Mesa-POS-${pkg.version}-win.zip`)

if (!fs.existsSync(unpacked)) {
  console.error('Missing release/win-unpacked. Run npm run desktop:win first.')
  process.exit(1)
}

fs.rmSync(staging, { recursive: true, force: true })
fs.mkdirSync(stagedApp, { recursive: true })
fs.cpSync(unpacked, stagedApp, { recursive: true })
for (const extra of ['Install Mesa POS.bat', 'windows-install.ps1', 'HOW-TO-INSTALL.txt']) {
  fs.copyFileSync(path.join(root, 'electron', extra), path.join(stagedApp, extra))
}
if (fs.existsSync(dest)) fs.unlinkSync(dest)

execFileSync('tar', ['-a', '-c', '-f', dest, '-C', staging, folderName], { stdio: 'inherit' })
fs.rmSync(staging, { recursive: true, force: true })
console.log(`Wrote ${dest}`)
