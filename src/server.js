#!/usr/bin/env node
'use strict';

// razer-ornata-macos — local web GUI server.
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
// A tiny zero-dependency HTTP server (Node built-ins only). It serves the
// single-page GUI and exposes a handful of JSON endpoints. All device I/O goes
// through src/engine.js — the same module the CLI uses — so the keyboard is
// only ever touched from this Node process.

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const { exec } = require('child_process');

const { KEYS, GROUPS, ALIASES } = require('./layout');
const { ROWS, COLS, probe, applySpec, withKeyboard, setBrightness, ORNATA_PIDS } = require('./engine');

const HOST = '127.0.0.1';
const PORT = Number(process.env.ORNATA_GUI_PORT) || 8787;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const SCENES_DIR = path.join(__dirname, '..', 'scenes');

// --- helpers ----------------------------------------------------------------

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 1024 * 1024) { reject(new Error('request body too large')); req.destroy(); return; }
      data += chunk;
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch (e) { reject(new Error('invalid JSON body')); }
    });
    req.on('error', reject);
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function serveStatic(res, urlPath) {
  // Only ever serve from PUBLIC_DIR; block traversal.
  const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  const full = path.join(PUBLIC_DIR, rel);
  if (!full.startsWith(PUBLIC_DIR)) { sendJson(res, 403, { error: 'forbidden' }); return; }
  fs.readFile(full, (err, buf) => {
    if (err) { sendJson(res, 404, { error: 'not found' }); return; }
    const ext = path.extname(full).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(buf);
  });
}

// Safe scene name -> absolute path inside scenes/.
function scenePath(name) {
  const base = path.basename(String(name || ''));
  if (!/^[\w.-]+$/.test(base)) throw new Error('bad scene name');
  const withExt = base.endsWith('.json') ? base : base + '.json';
  const full = path.join(SCENES_DIR, withExt);
  if (!full.startsWith(SCENES_DIR)) throw new Error('bad scene path');
  return full;
}

function listScenes() {
  try {
    return fs.readdirSync(SCENES_DIR)
      .filter((f) => f.endsWith('.json'))
      .sort();
  } catch (_) { return []; }
}

// --- API --------------------------------------------------------------------

// The visual keyboard needs, per key: name, [row,col], and a short label.
// Labels for keys whose display differs from their internal name.
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
  return { rows: ROWS, cols: COLS, keys, groups: GROUPS, aliases: ALIASES };
}

async function handleApi(req, res, url) {
  const p = url.pathname;

  if (req.method === 'GET' && p === '/api/layout') {
    return sendJson(res, 200, layoutPayload());
  }

  if (req.method === 'GET' && p === '/api/status') {
    const info = probe();
    return sendJson(res, 200, info);
  }

  if (req.method === 'GET' && p === '/api/scenes') {
    return sendJson(res, 200, { scenes: listScenes() });
  }

  if (req.method === 'GET' && p === '/api/scene') {
    try {
      const full = scenePath(url.searchParams.get('name'));
      const scene = JSON.parse(fs.readFileSync(full, 'utf8'));
      return sendJson(res, 200, { name: path.basename(full), scene });
    } catch (e) {
      return sendJson(res, 404, { error: e.message });
    }
  }

  if (req.method === 'POST' && p === '/api/apply') {
    const spec = await readBody(req);
    try {
      const result = applySpec(spec);
      return sendJson(res, 200, { ok: true, litCells: result.litCells, device: result.name });
    } catch (e) {
      return sendJson(res, 200, { ok: false, code: e.code || 'ERROR', error: e.message });
    }
  }

  if (req.method === 'POST' && p === '/api/brightness') {
    const body = await readBody(req);
    try {
      const result = withKeyboard((addon, kbd) => {
        setBrightness(addon, kbd.internalDeviceId, body.brightness);
        return ORNATA_PIDS[kbd.productId];
      });
      return sendJson(res, 200, { ok: true, device: result });
    } catch (e) {
      return sendJson(res, 200, { ok: false, code: e.code || 'ERROR', error: e.message });
    }
  }

  if (req.method === 'POST' && p === '/api/off') {
    try {
      const result = applySpec({ background: '#000000', keys: {} });
      return sendJson(res, 200, { ok: true, device: result.name });
    } catch (e) {
      return sendJson(res, 200, { ok: false, code: e.code || 'ERROR', error: e.message });
    }
  }

  if (req.method === 'POST' && p === '/api/save') {
    const body = await readBody(req);
    try {
      const full = scenePath(body.name);
      // Persist a clean scene object.
      const scene = {};
      if (body.scene && body.scene.brightness !== undefined) scene.brightness = body.scene.brightness;
      scene.background = (body.scene && body.scene.background) || '#000000';
      if (body.scene && body.scene.groups && Object.keys(body.scene.groups).length) scene.groups = body.scene.groups;
      scene.keys = (body.scene && body.scene.keys) || {};
      fs.writeFileSync(full, JSON.stringify(scene, null, 2) + '\n', 'utf8');
      return sendJson(res, 200, { ok: true, name: path.basename(full) });
    } catch (e) {
      return sendJson(res, 400, { ok: false, error: e.message });
    }
  }

  return sendJson(res, 404, { error: 'unknown endpoint' });
}

// --- server -----------------------------------------------------------------

const server = http.createServer((req, res) => {
  let url;
  try { url = new URL(req.url, `http://${HOST}:${PORT}`); }
  catch (_) { return sendJson(res, 400, { error: 'bad url' }); }

  if (url.pathname.startsWith('/api/')) {
    handleApi(req, res, url).catch((e) => {
      if (!res.headersSent) sendJson(res, 500, { error: e.message });
    });
    return;
  }

  if (req.method === 'GET') return serveStatic(res, url.pathname);
  sendJson(res, 405, { error: 'method not allowed' });
});

server.listen(PORT, HOST, () => {
  const urlStr = `http://${HOST}:${PORT}/`;
  console.log('razer-ornata-macos GUI running at ' + urlStr);
  console.log('Press Ctrl+C to stop.');
  console.log('NOTE: quit the "Razer macOS" menu-bar app first — it holds the keyboard open.');
  if (process.env.ORNATA_GUI_NO_OPEN !== '1') {
    exec('open ' + JSON.stringify(urlStr), () => { /* best effort */ });
  }
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`Error: port ${PORT} is already in use. Set ORNATA_GUI_PORT to another port.`);
  } else {
    console.error('Error: ' + e.message);
  }
  process.exit(1);
});
