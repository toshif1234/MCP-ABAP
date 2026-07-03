const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getSchema: () => ipcRenderer.invoke('get-schema'),
  loadEnv: () => ipcRenderer.invoke('load-env'),
  saveEnv: (values) => ipcRenderer.invoke('save-env', values),
  getServerCommandHint: () => ipcRenderer.invoke('get-server-command'),
  updateClaudeConfig: (configJson) => ipcRenderer.invoke('update-claude-config', configJson)
});
