const { app, BrowserWindow, ipcMain, Tray, Menu, Notification } = require('electron');
const path = require('path');
const dns = require('dns');
const https = require('https');
const { autoUpdater } = require('electron-updater');

let mainWindow = null;
let updaterWindow = null;
let tray = null;
let isQuitting = false;

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    frame: false,
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

ipcMain.on('minimize-window', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('close-window', () => {
  if (mainWindow) mainWindow.hide();
});

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('get-latest-release-version', async () => {
  try {
    const data = await fetchLatestReleaseInfo();
    return { success: true, version: data.tag_name || null, name: data.name || null, body: data.body || null };
  } catch (error) {
    return { success: false, error: error.message || 'Unable to fetch latest release' };
  }
});

ipcMain.handle('compare-version-to-github', async () => {
  const localVersion = app.getVersion();
  try {
    const data = await fetchLatestReleaseInfo();
    const latestVersion = data.tag_name || data.name || null;
    return {
      success: true,
      localVersion,
      latestVersion,
      needsUpdate: latestVersion && latestVersion !== localVersion
    };
  } catch (error) {
    return { success: false, error: error.message || 'Unable to compare versions' };
  }
});

function fetchLatestReleaseInfo() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: '/repos/isvxs/Nook/releases/latest',
      method: 'GET',
      headers: {
        'User-Agent': 'Nook-App',
        Accept: 'application/vnd.github.v3+json'
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode !== 200) {
          return reject(new Error(`GitHub API returned ${res.statusCode}`));
        }
        try {
          const data = JSON.parse(body);
          resolve(data);
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

// 自動更新機制
function initAutoUpdater() {
  autoUpdater.setFeedURL({ provider: 'github', owner: 'isvxs', repo: 'Nook' });
  autoUpdater.autoDownload = false;

  autoUpdater.on('update-available', () => {
    createUpdaterWindow();
    autoUpdater.downloadUpdate();
  });

  autoUpdater.on('error', (error) => {
    console.error('Update error:', error == null ? 'unknown' : error.message);
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

function checkForUpdatesWhenOnline() {
  dns.lookup('github.com', (err) => {
    if (err) {
      console.log('No network connection detected. Update check skipped.');
      return;
    }
    initAutoUpdater();
    autoUpdater.checkForUpdates();
  });
}

app.whenReady().then(() => {
  createMainWindow();
  setupTray();

  if (app.isPackaged) {
    checkForUpdatesWhenOnline();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('window-all-closed', (e) => {
  e.preventDefault();
});