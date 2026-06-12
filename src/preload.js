const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onWindowShown: (callback) => ipcRenderer.on('window-shown', callback),
  onWindowHidden: (callback) => ipcRenderer.on('window-hidden', callback),
  submitInput: (text) => ipcRenderer.send('input-submit', text),
  closeWindow: () => ipcRenderer.send('window-close'),
});
