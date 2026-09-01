import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const unpacked = path.join(root, 'release', 'win-unpacked')
const iss = path.join(root, 'electron', 'mesa-pos.iss')
const setupOut = path.join(root, 'release', 'Mesa-POS-Setup.exe')

if (!fs.existsSync(path.join(unpacked, 'Mesa POS.exe'))) {
  console.error('Missing release/win-unpacked. Run electron-builder first.')
  process.exit(1)
}

function isccCandidates() {
  const pf = process.env['ProgramFiles(x86)'] || process.env.ProgramFiles || 'C:\\Program Files (x86)'
  const pf64 = process.env.ProgramFiles || 'C:\\Program Files'
  const local = process.env.LOCALAPPDATA || ''
  return [
    path.join(pf, 'Inno Setup 6', 'ISCC.exe'),
    path.join(pf64, 'Inno Setup 6', 'ISCC.exe'),
    path.join(pf, 'Inno Setup 5', 'ISCC.exe'),
    path.join(local, 'Programs', 'Inno Setup 6', 'ISCC.exe'),
    'ISCC.exe',
  ]
}

function findIscc() {
  for (const candidate of isccCandidates()) {
    try {
      if (candidate === 'ISCC.exe') {
        const where = spawnSync('where', ['ISCC.exe'], { encoding: 'utf8' })
        if (where.status === 0 && where.stdout.trim()) return where.stdout.split(/\r?\n/)[0].trim()
        continue
      }
      if (fs.existsSync(candidate)) return candidate
    } catch {
      /* continue */
    }
  }
  return null
}

function installInno() {
  console.log('Inno Setup not found. Installing with winget...')
  const result = spawnSync(
    'winget',
    [
      'install',
      '--id',
      'JRSoftware.InnoSetup',
      '-e',
      '--source',
      'winget',
      '--accept-package-agreements',
      '--accept-source-agreements',
      '--disable-interactivity',
    ],
    { stdio: 'inherit', shell: true },
  )
  if (result.status !== 0) {
    throw new Error('Could not install Inno Setup. Install it from https://jrsoftware.org/isinfo.php then rerun npm run desktop:win')
  }
}

let iscc = findIscc()
if (!iscc) {
  installInno()
  iscc = findIscc()
}
if (!iscc) {
  throw new Error('Inno Setup compiler (ISCC.exe) not found after install')
}

console.log(`Compiling installer with ${iscc}`)
execFileSync(iscc, [iss], { stdio: 'inherit', cwd: root })
if (!fs.existsSync(setupOut)) {
  throw new Error(`Expected ${setupOut}`)
}
console.log(`Wrote ${setupOut}`)
