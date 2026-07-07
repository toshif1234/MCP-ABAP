const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getSchema: () => ipcRenderer.invoke('get-schema'),
  loadEnv: () => ipcRenderer.invoke('load-env'),
  saveEnv: (values) => ipcRenderer.invoke('save-env', values),
  getServerCommandHint: () => ipcRenderer.invoke('get-server-command'),
  updateClaudeConfig: (configJson) => ipcRenderer.invoke('update-claude-config', configJson),
  authenticateMcp: (username, password) => ipcRenderer.invoke('authenticate-mcp', username, password),
  testAbapConnection: (config) => ipcRenderer.invoke('test-abap-connection', config),
  testCapConnection: (config) => ipcRenderer.invoke('test-cap-connection', config),
  testGithubConnection: (config) => ipcRenderer.invoke('test-github-connection', config),
  fetchSkills: (username, password) => ipcRenderer.invoke('fetch-skills', username, password)
});
