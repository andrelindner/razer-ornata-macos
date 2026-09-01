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

// Power-button glyph as a macOS "template" image (black + alpha), 1x (22px) and
// 2x (44px). Generated by assets/make_icon.py; embedded so no external asset is
// needed. macOS auto-tints template images for light/dark menu bars.
const TRAY_ICON_22_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAABYAAAAWCAYAAADEtGw7AAABq0lEQVR4nMWUu0oDQRSGv91V4wVRrJSopPACdjZKSCXkJdRXE6ws8wC+gTfSCBZWwUoEbylEQ+LK4H/CMJldxcYDw5k95z///HNmZuEfLZE/APaD2J/IEiDV9zKQa6wolnq4EbPC0IzE7B14Aj6BGcWSCK6QOJGfBZZE5Kzv4QeaD4SZDWpHLNGoAGfAK7Cm3ALwKHWbiq0DL8JWwraEinOg5ymZUnxc3u0g03wamBO2F7YkjcwbwLxWN+KKVDvMm2KOFGEbBUKHQafmSqufAJPA2HeaQw0UmxQmV00WI87kGwI+A4slKiy2KGzuqc58QCK/J9ApcC+Q3YzME2C9vhc2V+2QK1RTU+I6cvkH3lUzAh9bi22J4L5O8HubCGqjxDfy9bJXJbN8PagltsCWVv4AtkvUW2xb2L5qY2Kxg2lJyXnwXO3w/Gd/Lmwr4BhRnQKrwIMKLoFmBNtULhd21auPWiq/C3S8PraBY422F+8IG21BUUuqwBHQ9YhsdJWrFrWg6FeXeXfWbXMH2ND3LXAB3EWwvzI7sLKdlf6DfzI7FMO6VrgnbU89al9KMGGzK6DZFQAAAABJRU5ErkJggg==';
const TRAY_ICON_44_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAACwAAAAsCAYAAAAehFoBAAAD0UlEQVR4nO1Yz0tVQRT+5r6X2g+1lRQ+V5G5icCF0LIWCRL09uGy8C9QEPdB/0ArF0KrFq5aBf3YaORGIkJoIUpZiYukIPP5fDcGviOHw72++2MevIUfDPe++2a+78yZMzNnBjgDKgAcSwVdDpfxW1cg4nMSwAeWSfNf1yCiJ0cAHACIWQ4A1FSIBBEKAUcDrwHoA9AEcMT3Mf4XdZPB3iCPH3yvkjsGcIyAiAp4sl0bPfSuTShIKHXEYPFYK0BMOpZW3nDJWlHIBxmnMqmKIlYxP6icEMTgCsmnAHwGsAHgBSdUXk87lj5ybJBzihqlNxoR6AWwTdIjPh+xjkwwjxvKe36l8M+7quO+LthWc21To60DsnjYE/aQsMXiMZRSNwuG+BS+XmqUCbMTiFeeqWXqO2PPrhxjaiJ5D/v3O8rDUs+33SNXTG6tVdjDEYX9UNeVBy5wqJ0ZxmG+i7EuIS79twfkADnr1GiW2RvEc76sKe9K3L1W8Svrae2UrTli8W3eqRgWL68ZrtwQz8wkkH8E0G+8myX5cSyXyGGdMGO0C60OWxzeJsn/ABg1huh2SVwa0maUXMcqhLayrhYWEvwSt021TM2ZOkUS+Cqfcwn89Tb8qaIez9nzBsn8zB4oE2eExPQAOWNqtKiZKyzEkHMANkl2yOdikd6nQDgWjcYmtZHklKQlRCpd5QzX9d4GPvI4cmqNGrVzGzzMnrZUvS8BEh+B8HhOUKNFTa+d2WDBRUUs9X6pb2URG05JX7U28hicdFLw+31o9GTUTjVYeulnr8xWIZCYDhHHznAeq5VhL20kTzN4B8A+3yVDG++AweNGY5/aiQanQTqyYpacVfN/GUR8rhqNlSIaskYuJOQRE/yvzOmgwudEQj6xYGzIBOndde5AmtBnWuDyUyQ0nNoYbNbWoKa2IbcXlhP2+/mCRjtl7HwC77LRzgXJF0bZc8nWhHxaGVFtY7gzdaaVscLZoFaWu49USE9nTYIi8fzErKNy0NSlov7vYRuJW51YzRrNQhDP6NCwRq8DeMiEPg39rLOeYqyEQruRyhR/+i7hJQ+VcvbSdwnfALwH8AnAV34bAXATwG2zQcjFTJXJz30A/wLmKScxdR7AkiI+MpPmtNJUt5rybYmcWiMY9Gg8BrBrjGlw8T/ku/2tO7VLjiTu4EaLJ3wK+JTbaJyx7LCNpI+5Ty5Fe6YTosu8o7gH4BaAKzz6ePwG8JMn5FcA3qj8RHN03GBpW+FQa/SqS5K/DAmNqlphComGChOXYohTN6ByjVVKLDQsZ9wBjTOgU/gPnv1GRhGO9AUAAAAASUVORK5CYII=';

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
