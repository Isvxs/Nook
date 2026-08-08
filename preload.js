const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  sendNotification: (data) => ipcRenderer.send('show-notification', data),
  onUpdateProgress: (callback) => ipcRenderer.on('update-progress', (event, percent) => callback(percent)),
  onUpdateCompleted: (callback) => ipcRenderer.on('update-completed', (event) => callback()),
  onUpdateStatus: (callback) => ipcRenderer.on('update-status', (event, msg) => callback(msg)),
  onDeleteStatus: (callback) => ipcRenderer.on('delete-status', (event, msg) => callback(msg)),
  onDeleteProgress: (callback) => ipcRenderer.on('delete-progress', (event, percent) => callback(percent)),
  minimizeWindow: () => ipcRenderer.send('minimize-window'),
  closeWindow: () => ipcRenderer.send('close-window'),
  setAutoUpdateEnabled: (enabled) => ipcRenderer.send('set-auto-update-enabled', enabled),
  deleteApp: (payload) => ipcRenderer.invoke('delete-app', payload),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getLatestReleaseVersion: () => ipcRenderer.invoke('get-latest-release-version'),
  compareVersionToGithub: () => ipcRenderer.invoke('compare-version-to-github')
});