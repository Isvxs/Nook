const { app, BrowserWindow, ipcMain, Tray, Menu, Notification } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

let mainWindow = null;
let updaterWindow = null;
let tray = null;
let isQuitting = false;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    icon: path.join(__dirname, 'NookB.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.loadFile('index.html');

  // 點擊關閉視窗時不結束程式，隱藏至系統托盤背景繼續運作
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

// 建立獨立的更新進度條視窗
function createUpdaterWindow() {
  updaterWindow = new BrowserWindow({
    width: 500,
    height: 280,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    icon: path.join(__dirname, 'NookB.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  updaterWindow.loadFile('updater.html');
}

function setupTray() {
  tray = new Tray(path.join(__dirname, 'NookB.png'));
  const contextMenu = Menu.buildFromTemplate([
    {
      label: '開啟 Nook',
      click: () => {
        mainWindow.show();
        mainWindow.focus();
      }
    },
    { type: 'separator' },
    {
      label: '結束應用程式',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setToolTip('Nook 便利貼');
  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => {
    mainWindow.show();
    mainWindow.focus();
  });
}

// 接收來自渲染進程發送的系統通知
ipcMain.on('show-notification', (event, { title, body }) => {
  if (Notification.isSupported()) {
    const notif = new Notification({
      title: title || 'Nook 提醒',
      body: body,
      icon: path.join(__dirname, 'NookB.png'),
      urgency: 'critical'
    });
    notif.on('click', () => {
      if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
      }
    });
    notif.show();
  }
});

// 自動更新機制
function initAutoUpdater() {
  autoUpdater.autoDownload = true;

  autoUpdater.on('update-available', () => {
    createUpdaterWindow();
  });

  autoUpdater.on('download-progress', (progressObj) => {
    if (updaterWindow && !updaterWindow.isDestroyed()) {
      updaterWindow.webContents.send('update-progress', Math.floor(progressObj.percent));
    }
  });

  autoUpdater.on('update-downloaded', () => {
    if (updaterWindow && !updaterWindow.isDestroyed()) {
      updaterWindow.webContents.send('update-completed');
    }
    setTimeout(() => {
      autoUpdater.quitAndInstall();
    }, 1500);
  });
}

app.whenReady().then(() => {
  createMainWindow();
  setupTray();

  if (app.isPackaged) {
    initAutoUpdater();
    autoUpdater.checkForUpdatesAndNotify();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('window-all-closed', (e) => {
  e.preventDefault();
});