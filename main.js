const { app, BrowserWindow, ipcMain, Tray, Menu, Notification } = require('electron');
const fs = require('fs');
const path = require('path');
const dns = require('dns');
const https = require('https');
const { autoUpdater } = require('electron-updater');

let mainWindow = null;
let updaterWindow = null;
let deleteWindow = null;
let tray = null;
let isQuitting = false;
let autoUpdateEnabled = true;

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
  mainWindow.setMenu(null);

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
  updaterWindow.setMenu(null);

  updaterWindow.loadFile('updater.html');
}

function createDeleteWindow() {
  deleteWindow = new BrowserWindow({
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
  deleteWindow.setMenu(null);

  deleteWindow.loadFile('delete.html');
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

ipcMain.on('set-auto-update-enabled', (event, enabled) => {
  autoUpdateEnabled = !!enabled;
});

ipcMain.handle('delete-app', async (event, payload) => {
  const saveData = payload?.saveSettingsAndNotes === true;
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.hide();
    }
    if (updaterWindow && !updaterWindow.isDestroyed()) {
      updaterWindow.close();
    }
    if (deleteWindow && !deleteWindow.isDestroyed()) {
      deleteWindow.close();
    }

    createDeleteWindow();
    deleteWindow.once('ready-to-show', () => deleteWindow.show());
    deleteWindow.webContents.on('did-finish-load', async () => {
      deleteWindow.webContents.send('delete-status', '開始刪除 Nook...');

      try {
        const userDataPath = app.getPath('userData');
        if (saveData) {
          await cleanUserDataPreservingLocalStorage(userDataPath);
        } else {
          await fs.promises.rm(userDataPath, { recursive: true, force: true });
        }
      } catch (cleanupError) {
        console.error('Error cleaning user data:', cleanupError);
      }

      let currentProgress = 0;
      const sendProgress = () => {
        if (!deleteWindow || deleteWindow.isDestroyed()) return;
        const increment = Math.floor(Math.random() * 15) + 5;
        currentProgress = Math.min(100, currentProgress + increment);
        deleteWindow.webContents.send('delete-progress', currentProgress);
        deleteWindow.webContents.send('delete-status', `正在刪除中：${currentProgress}%`);

        if (currentProgress < 100) {
          setTimeout(sendProgress, 150 + Math.floor(Math.random() * 250));
        } else {
          setTimeout(() => {
            if (!deleteWindow || deleteWindow.isDestroyed()) return;
            deleteWindow.webContents.send('delete-status', '刪除完成，正在關閉 Nook...');
            setTimeout(() => {
              if (deleteWindow && !deleteWindow.isDestroyed()) deleteWindow.close();
              if (tray) tray.destroy();
              app.quit();
            }, 800 + Math.floor(Math.random() * 300));
          }, 400 + Math.floor(Math.random() * 300));
        }
      };

      setTimeout(sendProgress, 200);
    });

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

async function cleanUserDataPreservingLocalStorage(userDataPath) {
  const allowed = new Set(['Local Storage', 'Preferences', 'Settings', 'Cookies', 'IndexedDB']);
  const entries = await fs.promises.readdir(userDataPath, { withFileTypes: true });
  for (const entry of entries) {
    if (allowed.has(entry.name)) {
      continue;
    }
    const targetPath = path.join(userDataPath, entry.name);
    await fs.promises.rm(targetPath, { recursive: true, force: true });
  }
}

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('get-latest-release-version', async () => {
  try {
    const data = await fetchLatestReleaseInfo();
    if (!data) {
      return { success: true, version: null, name: null, body: null };
    }
    return { success: true, version: data.tag_name || null, name: data.name || null, body: data.body || null };
  } catch (error) {
    return { success: false, error: error.message || 'Unable to fetch latest release' };
  }
});

ipcMain.handle('compare-version-to-github', async () => {
  const localVersion = app.getVersion();
  try {
    const data = await fetchLatestReleaseInfo();
    const latestVersion = data ? (data.tag_name || data.name || null) : null;
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
      res.on('end', async () => {
        if (res.statusCode === 200) {
          try {
            const data = JSON.parse(body);
            resolve(data);
          } catch (error) {
            reject(error);
          }
          return;
        }

            if (res.statusCode === 404) {
          try {
            const tagInfo = await fetchLatestTagInfo();
            resolve(tagInfo);
            return;
          } catch (tagError) {
            resolve(null);
            return;
          }
        }

        reject(new Error(`GitHub API returned ${res.statusCode}`));
      });
    });

    req.on('error', reject);
    req.end();
  });
}


function fetchLatestTagInfo() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: '/repos/isvxs/Nook/tags?per_page=1',
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
          return reject(new Error(`GitHub tags API returned ${res.statusCode}`));
        }
        try {
          const data = JSON.parse(body);
          if (Array.isArray(data) && data.length > 0) {
            resolve({ tag_name: data[0].name, name: data[0].name, body: '' });
          } else {
            resolve(null);
          }
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

function initAutoUpdater() {
  if (!autoUpdateEnabled) return;
  autoUpdater.setFeedURL({ provider: 'github', owner: 'isvxs', repo: 'Nook' });
  autoUpdater.autoDownload = false;

  autoUpdater.on('checking-for-update', () => {
    if (updaterWindow && !updaterWindow.isDestroyed()) updaterWindow.webContents.send('update-status', '檢查是否有更新...');
  });

  autoUpdater.on('update-available', () => {
    if (updaterWindow && !updaterWindow.isDestroyed()) updaterWindow.webContents.send('update-status', '發現更新，正在下載...');
    autoUpdater.downloadUpdate();
  });

  autoUpdater.on('update-not-available', () => {
    if (updaterWindow && !updaterWindow.isDestroyed()) updaterWindow.webContents.send('update-status', '太好了！無須更新！');
    setTimeout(() => {
      if (updaterWindow && !updaterWindow.isDestroyed()) updaterWindow.close();
      createMainWindow();
    }, 1200);
  });

  autoUpdater.on('error', (error) => {
    console.error('Update error:', error == null ? 'unknown' : error.message);
    if (updaterWindow && !updaterWindow.isDestroyed()) updaterWindow.webContents.send('update-status', '更新錯誤，將離線使用');
    setTimeout(() => {
      if (updaterWindow && !updaterWindow.isDestroyed()) updaterWindow.close();
      createMainWindow();
    }, 1500);
  });

  autoUpdater.on('download-progress', (progressObj) => {
    if (updaterWindow && !updaterWindow.isDestroyed()) {
      updaterWindow.webContents.send('update-progress', Math.floor(progressObj.percent));
      updaterWindow.webContents.send('update-status', `正在下載：${Math.floor(progressObj.percent)}%`);
    }
  });

  autoUpdater.on('update-downloaded', () => {
    if (updaterWindow && !updaterWindow.isDestroyed()) {
      updaterWindow.webContents.send('update-completed');
      updaterWindow.webContents.send('update-status', '更新完成！正在開啟Nook的應用程式...');
    }
    setTimeout(() => {
      autoUpdater.quitAndInstall();
    }, 1500);
  });
}

function checkForUpdatesWhenOnline() {
  if (!autoUpdateEnabled) return;
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
  // 先建立 updater 視窗並顯示，之後根據網路與更新狀態啟動主視窗
  createUpdaterWindow();
  setupTray();

  if (updaterWindow && !updaterWindow.isDestroyed()) {
    updaterWindow.once('ready-to-show', () => updaterWindow.show());
    updaterWindow.webContents.on('did-finish-load', () => {
      updaterWindow.webContents.send('update-status', '檢查是否有更新...');
    });
  }

  if (app.isPackaged) {
    dns.lookup('github.com', (err) => {
      if (err) {
        if (updaterWindow && !updaterWindow.isDestroyed()) updaterWindow.webContents.send('update-status', '無網路，將離線使用');
        setTimeout(() => {
          if (updaterWindow && !updaterWindow.isDestroyed()) updaterWindow.close();
          createMainWindow();
        }, 1400);
        return;
      }

      initAutoUpdater();
      autoUpdater.checkForUpdates();
    });
  } else {
    // 開發模式：短暫顯示 updater 後開啟主視窗
    setTimeout(() => {
      if (updaterWindow && !updaterWindow.isDestroyed()) updaterWindow.webContents.send('update-status', '開發模式：跳過更新檢查');
      setTimeout(() => {
        if (updaterWindow && !updaterWindow.isDestroyed()) updaterWindow.close();
        createMainWindow();
      }, 800);
    }, 300);
  }
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('window-all-closed', (e) => {
  e.preventDefault();
});