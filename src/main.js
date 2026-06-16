const { app, BrowserWindow, globalShortcut, ipcMain, screen, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const automation = require('./automation');

app.commandLine.appendSwitch('disable-gpu-cache');

let mainWindow = null;
let tray = null;
let contextMenu = null;
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let winStartX = 0;
let winStartY = 0;

function createTray() {
  const iconSize = 16;
  const canvas = Buffer.alloc(iconSize * iconSize * 4);
  for (let y = 0; y < iconSize; y++) {
    for (let x = 0; x < iconSize; x++) {
      const idx = (y * iconSize + x) * 4;
      const dx = x - iconSize / 2;
      const dy = y - iconSize / 2;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < iconSize / 2 - 1) {
        canvas[idx] = 0x4A;
        canvas[idx + 1] = 0xB8;
        canvas[idx + 2] = 0xFF;
        canvas[idx + 3] = 255;
      } else {
        canvas[idx] = 0;
        canvas[idx + 1] = 0;
        canvas[idx + 2] = 0;
        canvas[idx + 3] = 0;
      }
    }
  }
  const icon = nativeImage.createFromBuffer(canvas, { width: iconSize, height: iconSize });
  tray = new Tray(icon);
  tray.setToolTip('AskAI Copilot');

  updateTrayMenu();
  tray.setContextMenu(contextMenu);

  tray.on('click', () => toggleWindow());
}

function updateTrayMenu() {
  const isVisible = mainWindow && mainWindow.isVisible();
  contextMenu = Menu.buildFromTemplate([
    {
      label: isVisible ? '隐藏窗口' : '显示窗口',
      click: () => toggleWindow(),
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        if (mainWindow) {
          mainWindow.destroy();
          mainWindow = null;
        }
        app.quit();
      },
    },
  ]);
  if (tray) tray.setContextMenu(contextMenu);
}

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
    updateTrayMenu();
  }
}

function hideWindow() {
  if (!mainWindow) return;
  mainWindow.hide();
  mainWindow.webContents.send('window-hidden');
  updateTrayMenu();
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
  createTray();

  const ret = globalShortcut.register('CommandOrControl+Alt+Shift+O', () => {
    toggleWindow();
  });

  if (!ret) {
    console.error('[AskAI Copilot] Global shortcut Ctrl+Shift+K registration failed. It may be taken by another app.');
  } else {
    console.log('[AskAI Copilot] Global shortcut Ctrl+Shift+K registered successfully.');
  }

  if (process.argv.includes('--trigger-test')) {
    setTimeout(() => {
      console.log('[DEBUG] Auto-triggering Playwright test...');
      automation.performAutomation('爸爸你好，这是自动化测试内容').catch((err) => {
        console.error('[Playwright] Auto-test failed:', err.message);
      });
    }, 1000);
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
  if (tray) {
    tray.destroy();
    tray = null;
  }
});

ipcMain.on('input-submit', (_event, text) => {
  console.log('User input:', text);
  hideWindow();
  // TODO 这里触发后续 Playwright 的操作
  automation.performAutomation(text).catch((err) => {
    console.error('[Playwright] Unexpected error:', err.message);
  });
});

ipcMain.on('window-close', () => {
  hideWindow();
});

ipcMain.on('trigger-playwright', (_event, text) => {
  console.log('[DEBUG] trigger-playwright received:', text);
  automation.performAutomation(text).catch((err) => {
    console.error('[Playwright] Unexpected error:', err.message);
  });
});

ipcMain.on('window-drag-start', (_event, x, y) => {
  isDragging = true;
  dragStartX = x;
  dragStartY = y;
  const b = mainWindow.getBounds();
  winStartX = b.x;
  winStartY = b.y;
});

ipcMain.on('window-drag-move', (_event, x, y) => {
  if (!isDragging) return;
  const area = screen.getPrimaryDisplay().workArea;
  const wBounds = mainWindow.getBounds();
  const newX = Math.max(area.x, Math.min(winStartX + (x - dragStartX), area.x + area.width - wBounds.width));
  const newY = Math.max(area.y, Math.min(winStartY + (y - dragStartY), area.y + area.height - wBounds.height));
  mainWindow.setBounds({ x: newX, y: newY, width: wBounds.width, height: wBounds.height });
});

ipcMain.on('window-drag-end', () => {
  isDragging = false;
});
