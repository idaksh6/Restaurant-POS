import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const exe = path.join(root, 'release-agent', 'win-unpacked', 'Isarva POS Print Agent.exe')
const iss = path.join(here, 'isarva-print-agent.iss')
const setupOut = path.join(root, 'release-agent', 'Isarva-Print-Agent-Setup.exe')

if (!fs.existsSync(exe)) {
  console.error('Missing release-agent/win-unpacked. Run electron-builder first.')
  process.exit(1)
}

function findIscc() {
  const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'
  const pf = process.env.ProgramFiles || 'C:\\Program Files'
  const local = process.env.LOCALAPPDATA || ''
  const candidates = [
    path.join(pf86, 'Inno Setup 6', 'ISCC.exe'),
    path.join(pf, 'Inno Setup 6', 'ISCC.exe'),
    path.join(local, 'Programs', 'Inno Setup 6', 'ISCC.exe'),
  ]
  const found = candidates.find((c) => fs.existsSync(c))
  if (found) return found
  const where = spawnSync('where', ['ISCC.exe'], { encoding: 'utf8' })
  return where.status === 0 && where.stdout.trim() ? where.stdout.split(/\r?\n/)[0].trim() : null
}

const iscc = findIscc()
if (!iscc) {
  console.error('Inno Setup (ISCC.exe) not found. Install it from https://jrsoftware.org/isinfo.php (or run npm run desktop:win once).')
  process.exit(1)
}
execFileSync(iscc, [iss], { stdio: 'inherit', cwd: here })
if (!fs.existsSync(setupOut)) throw new Error(`Expected ${setupOut}`)
console.log(`Wrote ${setupOut}`)
