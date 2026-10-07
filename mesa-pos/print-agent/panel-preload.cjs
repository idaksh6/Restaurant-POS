const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('agent', {
  state: () => ipcRenderer.invoke('agent:state'),
  refresh: () => ipcRenderer.invoke('agent:refresh'),
  testAll: () => ipcRenderer.invoke('agent:test-all'),
  retry: (id) => ipcRenderer.invoke('agent:retry', id),
  jobs: () => ipcRenderer.invoke('agent:jobs'),
  setAutostart: (enabled) => ipcRenderer.invoke('agent:set-autostart', enabled),
  saveOrigins: (origins) => ipcRenderer.invoke('agent:save-origins', origins),
  openLogs: () => ipcRenderer.invoke('agent:open-logs'),
  checkUpdates: () => ipcRenderer.invoke('agent:check-updates'),
  restart: () => ipcRenderer.invoke('agent:restart'),
  onChange: (fn) => ipcRenderer.on('agent:changed', (_e, s) => fn(s)),
})
