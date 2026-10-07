/** Printer discovery, status and transports (TCP 9100 / Windows spooler RAW / Windows driver). */
const { app, BrowserWindow } = require('electron')
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const net = require('node:net')
const os = require('node:os')
const path = require('node:path')

class PrintError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

function runPowerShell(script, { timeoutMs = 15000, env } = {}) {
  return new Promise((resolve) => {
    let out = ''
    let err = ''
    let done = false
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { windowsHide: true, env: { ...process.env, ...(env || {}) } },
    )
    const finish = (code) => {
      if (done) return
      done = true
      clearTimeout(timer)
      resolve({ code, out, err })
    }
    const timer = setTimeout(() => {
      try {
        child.kill()
      } catch {
        /* ignore */
      }
      finish(-1)
    }, timeoutMs)
    child.stdout.on('data', (c) => (out += c.toString('utf8')))
    child.stderr.on('data', (c) => (err += c.toString('utf8')))
    child.on('error', () => finish(-1))
    child.on('close', (code) => finish(code))
  })
}

// Get-WmiObject + tab-separated output: works on Windows 7 (PowerShell 2, no ConvertTo-Json).
const LIST_PS = [
  "$ErrorActionPreference='SilentlyContinue'",
  '$ports=@{}',
  'Get-WmiObject Win32_TCPIPPrinterPort | ForEach-Object { $ports[$_.Name] = "$($_.HostAddress)|$($_.PortNumber)" }',
  'Get-WmiObject Win32_Printer | ForEach-Object { "$($_.Name)`t$($_.PortName)`t$($_.DriverName)`t$($_.WorkOffline)`t$($_.PrinterStatus)`t$($_.ExtendedPrinterStatus)`t$($_.DetectedErrorState)`t$($_.Default)`t$($ports[$_.PortName])" }',
].join('; ')

const VIRTUAL_RE = /(pdf|xps|onenote|fax|send to|anydesk|snagit|adobe)/i

async function listWindowsPrinters() {
  if (process.platform !== 'win32') return []
  const { out } = await runPowerShell(LIST_PS)
  return out
    .split(/\r?\n/)
    .map((l) => l.split('\t'))
    .filter((c) => c.length >= 8 && c[0].trim())
    .map(([name, port, driver, workOffline, status, ext, errState, isDefault, tcp]) => {
      const [host, tcpPort] = String(tcp || '').trim().split('|')
      const portName = String(port || '').trim()
      return {
        name: name.trim(),
        portName,
        driver: String(driver || '').trim(),
        isDefault: String(isDefault).trim().toLowerCase() === 'true',
        isUsb: /^usb/i.test(portName) || /usb/i.test(portName),
        isNetwork: Boolean(host),
        host: host || undefined,
        port: host ? Number(tcpPort) || 9100 : undefined,
        isVirtual: VIRTUAL_RE.test(`${name} ${driver} ${portName}`) || /^(file|portprompt|nul|xps)/i.test(portName),
        raw: {
          workOffline: String(workOffline).trim().toLowerCase() === 'true',
          status: Number(status),
          ext: Number(ext),
          err: Number(errState),
        },
      }
    })
}

const WMI_ERRORS = { 4: ['paper-out', 'Out of paper'], 7: ['cover-open', 'Cover open'], 8: ['error', 'Paper jam'], 10: ['error', 'Needs service'] }

function windowsHealth(p) {
  if (!p) return { state: 'offline', code: 'PRINTER_NOT_FOUND', detail: 'Printer not found in Windows' }
  const { workOffline, status, ext, err } = p.raw
  if (workOffline) return { state: 'offline', code: 'PRINTER_OFFLINE', detail: 'Set to "Use printer offline" in Windows' }
  if (status === 7 || ext === 7 || ext === 11 || err === 9) {
    return { state: 'offline', code: 'PRINTER_OFFLINE', detail: 'Printer is off or USB is disconnected' }
  }
  if (WMI_ERRORS[err]) {
    const [state, detail] = WMI_ERRORS[err]
    return { state, code: state === 'paper-out' ? 'PAPER_OUT' : state === 'cover-open' ? 'COVER_OPEN' : 'PRINTER_ERROR', detail }
  }
  if (ext === 8) return { state: 'error', code: 'PRINTER_ERROR', detail: 'Paused in Windows' }
  if (ext === 9 || status === 6) return { state: 'error', code: 'PRINTER_ERROR', detail: 'Printer error' }
  if (err === 3) return { state: 'online', detail: 'Paper low' }
  return { state: 'online' }
}

function tcpErrorToPrintError(err, host, port) {
  const code = err && err.code
  if (code === 'ETIMEDOUT' || code === 'TIMEOUT') return new PrintError('TIMEOUT', `No response from ${host}:${port}`)
  if (code === 'ECONNREFUSED') return new PrintError('PRINTER_OFFLINE', `${host}:${port} refused the connection`)
  if (code === 'EHOSTUNREACH' || code === 'ENETUNREACH' || code === 'EHOSTDOWN') {
    return new PrintError('PRINTER_OFFLINE', `${host} is not reachable on this network`)
  }
  if (code === 'ENOTFOUND') return new PrintError('PRINTER_NOT_FOUND', `Unknown address ${host}`)
  return new PrintError('PRINTER_OFFLINE', `Cannot reach ${host}:${port}`)
}

function tcpConnect(host, port, timeoutMs) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host, port })
    const timer = setTimeout(() => {
      socket.destroy()
      reject(tcpErrorToPrintError({ code: 'TIMEOUT' }, host, port))
    }, timeoutMs)
    socket.once('connect', () => {
      clearTimeout(timer)
      resolve(socket)
    })
    socket.once('error', (e) => {
      clearTimeout(timer)
      socket.destroy()
      reject(tcpErrorToPrintError(e, host, port))
    })
  })
}

/** DLE EOT 1/2/4 real-time status. Printers that don't answer are reported online (reachable). */
async function tcpHealth(host, port, timeoutMs = 3000, queryStatus = true) {
  let socket
  try {
    socket = await tcpConnect(host, port, timeoutMs)
  } catch (e) {
    return { state: 'offline', code: e.code || 'PRINTER_OFFLINE', detail: e.message }
  }
  if (!queryStatus) {
    socket.destroy()
    return { state: 'online' }
  }
  const bytes = await new Promise((resolve) => {
    const got = []
    const timer = setTimeout(() => resolve(got), 900)
    socket.on('data', (chunk) => {
      for (const b of chunk) if ((b & 0x93) === 0x12) got.push(b)
      if (got.length >= 3) {
        clearTimeout(timer)
        resolve(got)
      }
    })
    socket.on('error', () => resolve(got))
    socket.write(Buffer.from([0x10, 0x04, 0x01, 0x10, 0x04, 0x02, 0x10, 0x04, 0x04]))
  })
  socket.destroy()
  if (bytes.length < 3) return { state: 'online', detail: 'Reachable (printer does not report paper/cover status)' }
  const [printer, offline, paper] = bytes
  if (offline & 0x04) return { state: 'cover-open', code: 'COVER_OPEN', detail: 'Cover open' }
  if ((paper & 0x60) === 0x60 || offline & 0x20) return { state: 'paper-out', code: 'PAPER_OUT', detail: 'Out of paper' }
  if (offline & 0x40) return { state: 'error', code: 'PRINTER_ERROR', detail: 'Printer error' }
  if (printer & 0x08) return { state: 'offline', code: 'PRINTER_OFFLINE', detail: 'Printer reports offline' }
  if (paper & 0x0c) return { state: 'online', detail: 'Paper low' }
  return { state: 'online' }
}

async function sendTcp(host, port, data, timeoutMs = 5000) {
  const socket = await tcpConnect(host, port, timeoutMs)
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.destroy()
      reject(new PrintError('TIMEOUT', `Printer at ${host}:${port} stopped responding`))
    }, Math.max(timeoutMs, 15000))
    socket.once('error', (e) => {
      clearTimeout(timer)
      reject(tcpErrorToPrintError(e, host, port))
    })
    socket.end(data, () => {
      clearTimeout(timer)
      resolve()
    })
  })
  socket.destroy()
}

const RAW_PRINT_CS = `
using System;
using System.IO;
using System.Runtime.InteropServices;
public static class IsarvaRawPrint {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public class DOCINFO {
    [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
  }
  [DllImport("winspool.drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
  static extern bool OpenPrinter(string name, out IntPtr h, IntPtr d);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool ClosePrinter(IntPtr h);
  [DllImport("winspool.drv", EntryPoint = "StartDocPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
  static extern int StartDocPrinter(IntPtr h, int level, [In] DOCINFO di);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool WritePrinter(IntPtr h, byte[] buf, int count, out int written);
  public static string Send(string printer, string file, string doc) {
    byte[] data = File.ReadAllBytes(file);
    IntPtr h;
    if (!OpenPrinter(printer, out h, IntPtr.Zero)) return "NOT_FOUND:" + Marshal.GetLastWin32Error();
    try {
      DOCINFO di = new DOCINFO();
      di.pDocName = doc;
      di.pDataType = "RAW";
      if (StartDocPrinter(h, 1, di) == 0) return "START_FAILED:" + Marshal.GetLastWin32Error();
      try {
        StartPagePrinter(h);
        int written;
        bool ok = WritePrinter(h, data, data.Length, out written);
        EndPagePrinter(h);
        if (!ok || written != data.Length) return "WRITE_FAILED:" + Marshal.GetLastWin32Error();
      } finally { EndDocPrinter(h); }
      return "OK";
    } finally { ClosePrinter(h); }
  }
}
`

function rawHelperDll() {
  return path.join(app.getPath('userData'), 'IsarvaRawPrint-v1.dll')
}

async function ensureRawHelper() {
  const dll = rawHelperDll()
  if (fs.existsSync(dll)) return dll
  const src = path.join(os.tmpdir(), `isarva-rawprint-${process.pid}.cs`)
  fs.writeFileSync(src, RAW_PRINT_CS)
  const { code, err } = await runPowerShell(
    'Add-Type -TypeDefinition ([IO.File]::ReadAllText($env:ISARVA_SRC)) -OutputAssembly $env:ISARVA_DLL',
    { env: { ISARVA_SRC: src, ISARVA_DLL: dll }, timeoutMs: 60000 },
  )
  try {
    fs.unlinkSync(src)
  } catch {
    /* ignore */
  }
  if (code !== 0 || !fs.existsSync(dll)) throw new PrintError('PRINT_FAILED', `Could not prepare USB print helper ${err.trim()}`)
  return dll
}

async function sendWindowsRaw(printerName, data, docName = 'Isarva POS') {
  if (process.platform !== 'win32') throw new PrintError('PRINT_FAILED', 'USB printing is supported on Windows only')
  const dll = await ensureRawHelper()
  const file = path.join(os.tmpdir(), `isarva-job-${Date.now()}-${Math.random().toString(16).slice(2, 8)}.bin`)
  fs.writeFileSync(file, data)
  try {
    const { out, err } = await runPowerShell(
      'Add-Type -Path $env:ISARVA_DLL; [IsarvaRawPrint]::Send($env:ISARVA_PRN, $env:ISARVA_FILE, $env:ISARVA_DOC)',
      { env: { ISARVA_DLL: dll, ISARVA_PRN: printerName, ISARVA_FILE: file, ISARVA_DOC: docName }, timeoutMs: 30000 },
    )
    const result = out.trim().split(/\r?\n/).pop() || ''
    if (result === 'OK') return
    if (result.startsWith('NOT_FOUND')) throw new PrintError('PRINTER_NOT_FOUND', `"${printerName}" is not installed in Windows`)
    throw new PrintError('PRINT_FAILED', `Windows rejected the print job (${result || err.trim() || 'no response'})`)
  } finally {
    try {
      fs.unlinkSync(file)
    } catch {
      /* ignore */
    }
  }
}

function micronsPageSize(paperWidthMm) {
  return { width: Math.round(Number(paperWidthMm || 80) * 1000), height: 297000 }
}

/** Windows driver path (for printers whose driver does not accept RAW ESC/POS). */
function sendViaDriver(printerName, html, { paperWidthMm = 80, copies = 1 } = {}) {
  return new Promise((resolve, reject) => {
    const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true } })
    const finish = (err) => {
      if (!win.isDestroyed()) win.destroy()
      if (err) reject(err)
      else resolve()
    }
    win.webContents.once('did-fail-load', () => finish(new PrintError('RENDER_FAILED', 'Could not prepare the slip')))
    win.webContents.once('did-finish-load', () => {
      win.webContents.print(
        {
          silent: true,
          printBackground: true,
          deviceName: printerName,
          copies: Math.max(1, copies),
          margins: { marginType: 'none' },
          pageSize: micronsPageSize(paperWidthMm),
        },
        (ok, reason) => {
          if (ok) finish()
          else if (/invalid printer|not found/i.test(String(reason))) {
            finish(new PrintError('PRINTER_NOT_FOUND', `"${printerName}" is not installed in Windows`))
          } else finish(new PrintError('PRINT_FAILED', `Windows driver print failed (${reason || 'unknown'})`))
        },
      )
    })
    void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
  })
}

module.exports = {
  PrintError,
  listWindowsPrinters,
  windowsHealth,
  tcpHealth,
  sendTcp,
  sendWindowsRaw,
  sendViaDriver,
  runPowerShell,
}
