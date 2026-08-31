'use strict';

// razer-ornata-macos — Electron desktop app, preload bridge.
//
// Copyright (C) 2025 André Lindner
//
// This program is free software: you can redistribute it and/or modify it
// under the terms of the GNU General Public License as published by the Free
// Software Foundation, either version 2 of the License, or (at your option)
// any later version. Distributed WITHOUT ANY WARRANTY; see the GNU General
// Public License for more details.
//
// Exposes a small, typed API to the renderer. contextIsolation stays on and
// nodeIntegration off — the renderer never touches Node or the engine directly.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('razer', {
  // Layout + status
  layout: () => ipcRenderer.invoke('layout'),
  status: () => ipcRenderer.invoke('status'),
  mouseStatus: () => ipcRenderer.invoke('mouseStatus'),

  // Keyboard
  applyKeyboard: (spec) => ipcRenderer.invoke('applyKeyboard', spec),
  keyboardOff: () => ipcRenderer.invoke('keyboardOff'),

  // Mouse: { mode:'static'|'spectrum'|'wave'|'off', color?, direction?, brightness?, dpi? }
  mouse: (opts) => ipcRenderer.invoke('mouse', opts),

  // Scenes / profiles
  listScenes: () => ipcRenderer.invoke('listScenes'),
  loadScene: (name) => ipcRenderer.invoke('loadScene', name),
  saveScene: (name, scene) => ipcRenderer.invoke('saveScene', name, scene),
  loadSceneFile: () => ipcRenderer.invoke('loadSceneFile'),
  saveSceneFile: (scene, suggested) => ipcRenderer.invoke('saveSceneFile', scene, suggested),

  // Main -> renderer notifications (e.g. tray applied the default profile)
  onSceneLoaded: (cb) => ipcRenderer.on('scene-loaded', () => cb()),
});
