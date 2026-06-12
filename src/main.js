const { app, BrowserWindow, globalShortcut, ipcMain, screen } = require('electron');
const path = require('path');

app.commandLine.appendSwitch('disable-gpu-cache');

let mainWindow = null;

function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth } = primaryDisplay.workAreaSize;
  const winWidth = 520;
  const winHeight = 60;
  const x = Math.round((screenWidth - winWidth) / 2);
  const y = 360;

  mainWindow = new BrowserWindow({
    width: winWidth,
    height: winHeight,
    x,
    y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.on('blur', () => {
    hideWindow();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function showWindow() {
  if (!mainWindow) return;
  if (!mainWindow.isVisible()) {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth } = primaryDisplay.workAreaSize;
    const winWidth = 520;
    // TODO 这里改的x,y才生效
    mainWindow.setPosition(Math.round((screenWidth - winWidth) / 2), 360);
    mainWindow.show();
    mainWindow.focus();
    mainWindow.webContents.send('window-shown');
  }
}

function hideWindow() {
  if (!mainWindow) return;
  mainWindow.hide();
  mainWindow.webContents.send('window-hidden');
}

function toggleWindow() {
  if (!mainWindow || !mainWindow.isVisible()) {
    showWindow();
  } else {
    hideWindow();
  }
}

app.whenReady().then(() => {
  createWindow();

  const ret = globalShortcut.register('CommandOrControl+Shift+K', () => {
    toggleWindow();
  });

  if (!ret) {
    console.error('[AskAI Copilot] Global shortcut Ctrl+Shift+K registration failed. It may be taken by another app.');
  } else {
    console.log('[AskAI Copilot] Global shortcut Ctrl+Shift+K registered successfully.');
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

ipcMain.on('input-submit', (_event, text) => {
  console.log('User input:', text);
  hideWindow();
  // TODO: 触发 Playwright 自动化（第二步集成）
});

ipcMain.on('window-close', () => {
  hideWindow();
});
