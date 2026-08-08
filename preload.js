const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  sendNotification: (data) => ipcRenderer.send('show-notification', data),
  onUpdateProgress: (callback) => ipcRenderer.on('update-progress', (event, percent) => callback(percent)),
  onUpdateCompleted: (callback) => ipcRenderer.on('update-completed', (event) => callback()),
  onUpdateStatus: (callback) => ipcRenderer.on('update-status', (event, msg) => callback(msg)),
  minimizeWindow: () => ipcRenderer.send('minimize-window'),
  closeWindow: () => ipcRenderer.send('close-window'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getLatestReleaseVersion: () => ipcRenderer.invoke('get-latest-release-version'),
  compareVersionToGithub: () => ipcRenderer.invoke('compare-version-to-github')
});