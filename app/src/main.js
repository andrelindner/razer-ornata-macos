'use strict';

// razer-ornata-macos — Electron desktop app, main process.
//
// Copyright (C) 2025 André Lindner
//
// This program is free software: you can redistribute it and/or modify it
// under the terms of the GNU General Public License as published by the Free
// Software Foundation, either version 2 of the License, or (at your option)
// any later version.
//
// This program is distributed in the hope that it will be useful, but WITHOUT
// ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
// FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
//
// The main process is Node, so it requires the proven cli/ engine directly and
// drives the keyboard/mouse from here. The renderer talks to it only over IPC
// (see preload.js). We never run the cli's HTTP server.

const {
  app, BrowserWindow, Tray, Menu, ipcMain, dialog, nativeImage, shell,
} = require('electron');
const path = require('path');
const fs = require('fs');

// --- locate the reused engine + bundled scenes ------------------------------
// Dev:      app/src -> ../../cli/src/engine.js and ../../cli/scenes
// Packaged: extraResources copies cli/{src,scenes,addon.node} into
//           <resources>/cli, and engine.js computes its addon path as
//           path.join(__dirname,'..','addon.node') == <resources>/cli/addon.node,
//           so the same relative-path logic keeps working once packaged.
function enginePath() {
  if (app.isPackaged) return path.join(process.resourcesPath, 'cli', 'src', 'engine.js');
  return path.join(__dirname, '..', '..', 'cli', 'src', 'engine.js');
}
function layoutModulePath() {
  if (app.isPackaged) return path.join(process.resourcesPath, 'cli', 'src', 'layout.js');
  return path.join(__dirname, '..', '..', 'cli', 'src', 'layout.js');
}
function scenesDir() {
  if (app.isPackaged) return path.join(process.resourcesPath, 'cli', 'scenes');
  return path.join(__dirname, '..', '..', 'cli', 'scenes');
}

const engine = require(enginePath());
const { KEYS, GROUPS, ALIASES } = require(layoutModulePath());

// Short display labels for keys whose printed cap differs from the internal
// name (mirrors the labels used by the cli web GUI so the board reads naturally).
const LABELS = {
  BACKTICK: '`', MINUS: '-', EQUALS: '=', LBRACKET: '[', RBRACKET: ']', BACKSLASH: '\\',
  SEMICOLON: ';', QUOTE: "'", COMMA: ',', PERIOD: '.', SLASH: '/',
  N0: '0', N1: '1', N2: '2', N3: '3', N4: '4', N5: '5', N6: '6', N7: '7', N8: '8', N9: '9',
  ESC: 'Esc', BACKSPACE: '⌫', TAB: 'Tab', CAPS: 'Caps', ENTER: 'Enter',
  LSHIFT: 'Shift', RSHIFT: 'Shift', LCTRL: 'Ctrl', RCTRL: 'Ctrl',
  LALT: 'Alt', RALT: 'Alt', LWIN: 'Cmd', FN: 'Fn', SPACE: 'Space',
  UP: '↑', DOWN: '↓', LEFT: '←', RIGHT: '→',
  PRTSC: 'PrtSc', SCRLK: 'ScrLk', PAUSE: 'Pause',
  INS: 'Ins', HOME: 'Home', PGUP: 'PgUp', DEL: 'Del', END: 'End', PGDN: 'PgDn',
  NUMLOCK: 'Num', KP_DIV: '/', KP_MUL: '*', KP_MINUS: '-', KP_PLUS: '+',
  KP_ENTER: 'Ent', KP_DEL: '.', KP0: '0', KP1: '1', KP2: '2', KP3: '3',
  KP4: '4', KP5: '5', KP6: '6', KP7: '7', KP8: '8', KP9: '9',
  M1: 'M1', M2: 'M2',
};

function layoutPayload() {
  const keys = Object.entries(KEYS).map(([name, [r, c]]) => ({
    name, row: r, col: c, label: LABELS[name] || name,
  }));
  return { rows: engine.ROWS, cols: engine.COLS, keys, groups: GROUPS, aliases: ALIASES };
}

// --- scenes helpers ---------------------------------------------------------
function scenePath(name) {
  const base = path.basename(String(name || ''));
  if (!/^[\w.-]+$/.test(base)) throw new Error('bad scene name');
  const withExt = base.endsWith('.json') ? base : base + '.json';
  const dir = scenesDir();
  const full = path.join(dir, withExt);
  if (!full.startsWith(dir)) throw new Error('bad scene path');
  return full;
}
function listScenes() {
  try {
    return fs.readdirSync(scenesDir()).filter((f) => f.endsWith('.json')).sort();
  } catch (_) { return []; }
}

// Persist a clean scene object (same shape the cli web GUI saves).
function cleanScene(scene) {
  const s = scene || {};
  const out = {};
  if (s.brightness !== undefined) out.brightness = s.brightness;
  out.background = s.background || '#000000';
  if (s.groups && Object.keys(s.groups).length) out.groups = s.groups;
  out.keys = s.keys || {};
  return out;
}

// Wrap an engine call so a DEVICE_BUSY / error becomes a structured result the
// renderer can display, instead of throwing across IPC.
function guard(fn) {
  try {
    return Object.assign({ ok: true }, fn());
  } catch (e) {
    return { ok: false, code: e.code || 'ERROR', error: e.message };
  }
}

// --- IPC --------------------------------------------------------------------
function registerIpc() {
  ipcMain.handle('layout', () => layoutPayload());
  ipcMain.handle('status', () => engine.probe());
  ipcMain.handle('mouseStatus', () => engine.probeMouse());

  ipcMain.handle('applyKeyboard', (_e, spec) => guard(() => {
    const r = engine.applySpec(spec || {});
    return { litCells: r.litCells, device: r.name };
  }));

  ipcMain.handle('keyboardOff', () => guard(() => {
    const r = engine.applySpec({ background: '#000000', keys: {} });
    return { device: r.name };
  }));

  ipcMain.handle('mouse', (_e, opts) => guard(() => {
    const r = engine.applyMouse(opts || {});
    return { device: r.name };
  }));

  ipcMain.handle('listScenes', () => ({ scenes: listScenes() }));

  ipcMain.handle('loadScene', (_e, name) => {
    try {
      const full = scenePath(name);
      const scene = JSON.parse(fs.readFileSync(full, 'utf8'));
      return { ok: true, name: path.basename(full), scene };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('saveScene', (_e, name, scene) => {
    try {
      const full = scenePath(name);
      fs.writeFileSync(full, JSON.stringify(cleanScene(scene), null, 2) + '\n', 'utf8');
      return { ok: true, name: path.basename(full) };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  // Native open dialog -> return the parsed scene JSON.
  ipcMain.handle('loadSceneFile', async () => {
    const win = BrowserWindow.getFocusedWindow() || mainWindow;
    const res = await dialog.showOpenDialog(win, {
      title: 'Load lighting profile',
      filters: [{ name: 'Profiles', extensions: ['json'] }],
      properties: ['openFile'],
    });
    if (res.canceled || !res.filePaths.length) return { ok: false, canceled: true };
    try {
      const file = res.filePaths[0];
      const scene = JSON.parse(fs.readFileSync(file, 'utf8'));
      return { ok: true, name: path.basename(file), scene };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  // Native save dialog -> write the scene JSON anywhere.
  ipcMain.handle('saveSceneFile', async (_e, scene, suggested) => {
    const win = BrowserWindow.getFocusedWindow() || mainWindow;
    const res = await dialog.showSaveDialog(win, {
      title: 'Save lighting profile',
      defaultPath: (suggested || 'profile') + '.json',
      filters: [{ name: 'Profiles', extensions: ['json'] }],
    });
    if (res.canceled || !res.filePath) return { ok: false, canceled: true };
    try {
      fs.writeFileSync(res.filePath, JSON.stringify(cleanScene(scene), null, 2) + '\n', 'utf8');
      return { ok: true, name: path.basename(res.filePath) };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });
}

// --- window + tray ----------------------------------------------------------
let mainWindow = null;
let tray = null;
let isQuitting = false;

// Keyboard-keys glyph as a macOS "template" image (black + alpha), 1x (22px) and
// 2x (44px). Generated by assets/make_icon.py; embedded so no external asset is
// needed. macOS auto-tints template images for light/dark menu bars.
const TRAY_ICON_22_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAABYAAAAWCAYAAADEtGw7AAAA5klEQVR4nO2UuwrCUAyGv2pxUXyALtbr4Oqmj+7qK/gEKqLQQXTyVqkkh1hEeio69YcD6VdIcvKnhUqigFfVDEuBe0n+sYgyX/4SBFKxB8TCdsBS4j7QKcg1l7vOADgIzM4FmACRB59JkbomTYEu0AauwBkIpaPIg491Alliq1QM0KPdFOXOvFDnAWyl+4YplLHEg6+0wbx5E2PGHlhI7MOfubKOrdbmOklJrhNwWzEEjrnZqfungvztVsRAy7gcGPebBfn/t4JfbcUUGAnbAHOJfbj7pFWBffiCv31Zz/0GbyV5JZwe/tSHmJnpb1sAAAAASUVORK5CYII=';
const TRAY_ICON_44_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAACwAAAAsCAYAAAAehFoBAAABCElEQVR4nO2WUWrDMAyGPydhPdR2gR1gfdlDe7COHmCPgz3tXlu3Ni4BB1xjq+3AIYH/AxGQf4FkoVgghBBC3IEzzlrj3AOnifX/LiSnqa03nS5U+AS8AqtIN/gPwAfwmfhr6T0GQ5sGHkNLvGEvUYE19a2VcBe+uxD0Dfwl9gP0wFcU91ZR3+YSzN20D+epxkU20lTUe5LAErcMxpT6qwnPkoaF0RX8fbBjpnWjr59I76wCxol8vvLLGWwTxdXUt7c+HGtgCzwkE/sLvAP7aJr7inpv3bBVyCye5oaF4Qo+7RJol7hEu0QG7RKzpCv4tUugXWIhu4QzAsZW+ELMaWK9EEIIwd2cAXZzEICiqqgOAAAAAElFTkSuQmCC';

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 900,
    minWidth: 760,
    minHeight: 560,
    title: 'Razer Ornata Lighting',
    backgroundColor: '#16171c',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());

  // Open external links in the default browser, not inside the app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Closing the window hides it (app lives on in the menu bar) unless quitting.
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.hide();
      if (process.platform === 'darwin') app.dock && app.dock.hide();
    }
  });
}

function showWindow() {
  if (!mainWindow) createWindow();
  if (process.platform === 'darwin' && app.dock) app.dock.show();
  mainWindow.show();
  mainWindow.focus();
}

// Fire a keyboard action from the tray and notify the user of the outcome.
function trayApply(fn, okMsg) {
  const r = guard(fn);
  if (r.ok) {
    setTrayTitleFlash(okMsg);
  } else if (r.code === 'DEVICE_BUSY') {
    dialog.showMessageBox({
      type: 'warning',
      message: 'Quit the "Razer macOS" app first',
      detail: 'The Razer macOS menu-bar app holds the device open exclusively, which blocks this app. Quit it and try again.',
    });
  } else {
    dialog.showMessageBox({ type: 'error', message: 'Action failed', detail: r.error || 'Unknown error' });
  }
}

let trayFlashTimer = null;
function setTrayTitleFlash(text) {
  if (!tray) return;
  tray.setTitle(' ' + text);
  clearTimeout(trayFlashTimer);
  trayFlashTimer = setTimeout(() => tray && tray.setTitle(''), 2500);
}

function loadDefaultProfile() {
  trayApply(() => {
    const full = scenePath('default');
    const scene = JSON.parse(fs.readFileSync(full, 'utf8'));
    const r = engine.applySpec(scene);
    return { litCells: r.litCells, device: r.name };
  }, 'Default applied');
  if (mainWindow) mainWindow.webContents.send('scene-loaded');
}

function createTray() {
  const img = nativeImage.createEmpty();
  img.addRepresentation({ scaleFactor: 1, width: 22, height: 22, buffer: Buffer.from(TRAY_ICON_22_B64, 'base64') });
  img.addRepresentation({ scaleFactor: 2, width: 44, height: 44, buffer: Buffer.from(TRAY_ICON_44_B64, 'base64') });
  img.setTemplateImage(true);
  tray = new Tray(img);
  tray.setToolTip('Razer Ornata Lighting');
  const menu = Menu.buildFromTemplate([
    { label: 'Show / Hide Window', click: () => (mainWindow && mainWindow.isVisible() ? mainWindow.hide() : showWindow()) },
    { type: 'separator' },
    { label: 'Apply Default Profile', click: () => loadDefaultProfile() },
    { label: 'Turn Keyboard Off', click: () => trayApply(() => { const r = engine.applySpec({ background: '#000000', keys: {} }); return { device: r.name }; }, 'Keyboard off') },
    { type: 'separator' },
    { label: 'Quit', click: () => { isQuitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu);
  tray.on('click', () => showWindow());
}

function buildAppMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' },
        { type: 'separator' },
        { label: 'Quit', accelerator: 'Cmd+Q', click: () => { isQuitting = true; app.quit(); } },
      ],
    }] : []),
    {
      label: 'Keyboard',
      submenu: [
        { label: 'Apply Default Profile', click: () => loadDefaultProfile() },
        { label: 'Turn Keyboard Off', click: () => trayApply(() => { const r = engine.applySpec({ background: '#000000', keys: {} }); return { device: r.name }; }, 'Keyboard off') },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { label: 'Close', accelerator: 'Cmd+W', role: 'close' },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'toggleDevTools' },
      ],
    },
    {
      role: 'help',
      submenu: [
        { label: 'Project on GitHub', click: () => shell.openExternal('https://github.com/stickoking/razer-macos') },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// --- lifecycle --------------------------------------------------------------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => showWindow());

  app.whenReady().then(() => {
    // In dev the bundle icon isn't applied, so set the dock icon from assets.
    if (!app.isPackaged && process.platform === 'darwin' && app.dock) {
      const devIcon = path.join(__dirname, '..', 'assets', 'icon.png');
      if (fs.existsSync(devIcon)) app.dock.setIcon(devIcon);
    }
    registerIpc();
    buildAppMenu();
    createWindow();
    createTray();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
      else showWindow();
    });
  });

  // Keep running in the menu bar when all windows are closed.
  app.on('window-all-closed', () => { /* stay alive for the tray */ });

  app.on('before-quit', () => { isQuitting = true; });
}
