const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('mesaDisk', {
  loadDexie: () => ipcRenderer.sendSync('mesa-load-dexie'),
  saveDexie: (dump) => ipcRenderer.sendSync('mesa-save-dexie', dump),
})

contextBridge.exposeInMainWorld('mesaShell', {
  openKeyboard: () => ipcRenderer.invoke('mesa-open-keyboard'),
})

/** Silent / named-device print from the POS (Electron desktop / till). */
contextBridge.exposeInMainWorld('mesaPrint', (job) => ipcRenderer.invoke('mesa-print', job))

/** Installed OS printers for Target picker. */
contextBridge.exposeInMainWorld('mesaListPrinters', () => ipcRenderer.invoke('mesa-list-printers'))
