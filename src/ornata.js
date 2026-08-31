#!/usr/bin/env node
'use strict';

// Per-key lighting for the Razer Ornata Chroma on macOS.
//
// Reuses the native addon (addon.node) from an installed razer-macos build,
// which wraps librazermacos / OpenRazer. We talk to the keyboard through the
// same custom-frame path the app uses for its ripple effect:
//
//   getAllDevices()                     -> find the Ornata (PID 542 / 0x021E)
//   kbdSetCustomFrame(id, rowBytes)     -> write one matrix row
//   kbdSetModeCustom(id)                -> display the written frame
//
// A row payload is [ROW_ID, START_COL, STOP_COL, r,g,b, r,g,b, ...].

const path = require('path');
const fs = require('fs');
const { ROWS, COLS, KEYS, GROUPS, expand } = require('./layout');

const ADDON_PATH = path.join(__dirname, '..', 'addon.node');

// Product IDs of Ornata keyboards that share this 6x22 layout.
const ORNATA_PIDS = { 542: 'Ornata Chroma', 543: 'Ornata', 605: 'Ornata Chroma V2' };

function loadAddon() {
  if (!fs.existsSync(ADDON_PATH)) {
    fail(
      'addon.node not found.\n' +
      'Run ./setup.sh once to copy it out of the installed "Razer macOS.app".'
    );
  }
  try {
    return require(ADDON_PATH);
  } catch (e) {
    fail('could not load addon.node: ' + e.message);
  }
}

function findKeyboard(addon) {
  let devices;
  try {
    devices = addon.getAllDevices();
  } catch (e) {
    fail('getAllDevices failed: ' + e.message);
  }
  const kbd = (devices || []).find((d) => ORNATA_PIDS[d.productId]);
  if (!kbd) {
    if (!devices || devices.length === 0) {
      fail(
        'No Razer device could be opened.\n' +
        'Quit the "Razer macOS" menu-bar app first — it holds the device open\n' +
        '(exclusive access), which blocks this tool. Then try again.'
      );
    }
    fail('Ornata not found. Devices seen: ' + JSON.stringify(devices));
  }
  return kbd;
}

// hex ("#rrggbb" / "rrggbb" / "#rgb") -> [r,g,b]
function parseColor(hex) {
  let h = String(hex).trim().replace(/^#/, '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) throw new Error(`bad color "${hex}"`);
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

// Build a ROWS x COLS x 3 frame filled with a background color.
function blankFrame(bg) {
  const frame = [];
  for (let r = 0; r < ROWS; r++) {
    const row = [];
    for (let c = 0; c < COLS; c++) row.push([bg[0], bg[1], bg[2]]);
    frame.push(row);
  }
  return frame;
}

function applyFrame(addon, id, frame) {
  for (let r = 0; r < ROWS; r++) {
    const payload = [r, 0, COLS - 1];
    for (let c = 0; c < COLS; c++) payload.push(frame[r][c][0], frame[r][c][1], frame[r][c][2]);
    addon.kbdSetCustomFrame(id, new Uint8Array(payload));
  }
  addon.kbdSetModeCustom(id);
}

// Brightness input is a percentage 0..100; the device wants 0..255.
function parseBrightness(pct) {
  const n = Number(pct);
  if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error(`brightness must be 0..100, got "${pct}"`);
  return Math.round((n / 100) * 255);
}

function setBrightness(addon, id, pct) {
  addon.KbdSetBrightness(id, parseBrightness(pct));
}

function withKeyboard(fn) {
  const addon = loadAddon();
  const kbd = findKeyboard(addon);
  try {
    fn(addon, kbd);
  } finally {
    try { addon.closeAllDevices(); } catch (_) { /* ignore */ }
  }
}

// ---- commands ---------------------------------------------------------------

function cmdApply(sceneArg) {
  if (!sceneArg) fail('usage: ornata apply <scene.json>');
  const scene = JSON.parse(fs.readFileSync(sceneArg, 'utf8'));
  const bg = parseColor(scene.background || '#000000');
  const frame = blankFrame(bg);
  // scene.groups: optional custom named groups, e.g. { "movement": ["W","A","S","D"] }
  const extraGroups = scene.groups || {};
  let litCells = 0;
  for (const [key, color] of Object.entries(scene.keys || {})) {
    const rgb = parseColor(color);
    for (const [r, c] of expand(key, extraGroups)) { frame[r][c] = rgb; litCells++; }
  }
  withKeyboard((addon, kbd) => {
    if (scene.brightness !== undefined) setBrightness(addon, kbd.internalDeviceId, scene.brightness);
    applyFrame(addon, kbd.internalDeviceId, frame);
    const b = scene.brightness !== undefined ? `, brightness ${scene.brightness}%` : '';
    console.log(`Applied "${sceneArg}" (${litCells} cells${b}) to ${ORNATA_PIDS[kbd.productId]}.`);
  });
}

function cmdKeys(pairs) {
  // ornata key WASD ff0000 ARROWS 00ff00 J,K,L 0000ff  [--bg 101010] [--bright 80]
  let bg = [0, 0, 0];
  let brightness;
  const args = [];
  for (let i = 0; i < pairs.length; i++) {
    if (pairs[i] === '--bg') { bg = parseColor(pairs[++i]); continue; }
    if (pairs[i] === '--bright' || pairs[i] === '--brightness') { brightness = pairs[++i]; continue; }
    args.push(pairs[i]);
  }
  if (args.length === 0 || args.length % 2 !== 0) {
    fail('usage: ornata key <KEY|GROUP|k1,k2,..> <hex> [...] [--bg <hex>] [--bright 0..100]');
  }
  const frame = blankFrame(bg);
  let litCells = 0;
  for (let i = 0; i < args.length; i += 2) {
    const rgb = parseColor(args[i + 1]);
    for (const [r, c] of expand(args[i])) { frame[r][c] = rgb; litCells++; }
  }
  withKeyboard((addon, kbd) => {
    if (brightness !== undefined) setBrightness(addon, kbd.internalDeviceId, brightness);
    applyFrame(addon, kbd.internalDeviceId, frame);
    console.log(`Lit ${litCells} key(s) on ${ORNATA_PIDS[kbd.productId]}.`);
  });
}

function cmdBrightness(pct) {
  if (pct === undefined) fail('usage: ornata brightness <0..100>');
  withKeyboard((addon, kbd) => {
    setBrightness(addon, kbd.internalDeviceId, pct);
    console.log(`Brightness set to ${pct}% on ${ORNATA_PIDS[kbd.productId]}.`);
  });
}

function cmdGroups() {
  for (const [name, members] of Object.entries(GROUPS)) {
    const shown = name === 'ALL' ? `(all ${members.length} keys)` : members.join(' ');
    console.log(`${name}: ${shown}`);
  }
}

function cmdAll(args) {
  const hex = args[0];
  if (!hex) fail('usage: ornata all <hex> [--bright 0..100]');
  let brightness;
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--bright' || args[i] === '--brightness') brightness = args[++i];
  }
  const frame = blankFrame(parseColor(hex));
  withKeyboard((addon, kbd) => {
    if (brightness !== undefined) setBrightness(addon, kbd.internalDeviceId, brightness);
    applyFrame(addon, kbd.internalDeviceId, frame);
    console.log(`Set whole keyboard to #${hex.replace(/^#/, '')}.`);
  });
}

function cmdOff() {
  const frame = blankFrame([0, 0, 0]);
  withKeyboard((addon, kbd) => {
    applyFrame(addon, kbd.internalDeviceId, frame);
    console.log('All keys off (custom frame, everything black).');
  });
}

// Light one cell at a time so you can map physical keys to coordinates.
function cmdWalk(delayArg) {
  const delay = Number(delayArg) || 400;
  const cells = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) cells.push([r, c]);
  withKeyboard((addon, kbd) => {
    const id = kbd.internalDeviceId;
    let i = 0;
    console.log('Walking the matrix. Watch which key lights up; Ctrl+C to stop.');
    const step = () => {
      if (i >= cells.length) {
        applyFrame(addon, id, blankFrame([0, 0, 0]));
        try { addon.closeAllDevices(); } catch (_) {}
        console.log('Done.');
        process.exit(0);
      }
      const [r, c] = cells[i++];
      const frame = blankFrame([0, 0, 0]);
      frame[r][c] = [0, 255, 0];
      applyFrame(addon, id, frame);
      process.stdout.write(`  lit [${r},${c}]        \r`);
      setTimeout(step, delay);
    };
    step();
  });
}

function cmdList() {
  const byRow = Array.from({ length: ROWS }, () => []);
  for (const [name, [r, c]] of Object.entries(KEYS)) byRow[r].push([c, name]);
  byRow.forEach((row, r) => {
    row.sort((a, b) => a[0] - b[0]);
    console.log(`row ${r}: ` + row.map(([c, n]) => `${n}(${r},${c})`).join('  '));
  });
}

function cmdDevices() {
  const addon = loadAddon();
  console.log(JSON.stringify(addon.getAllDevices(), null, 2));
}

function fail(msg) {
  console.error('Error: ' + msg);
  process.exit(1);
}

function usage() {
  console.log(`razer-ornata-macos — per-key lighting for the Razer Ornata Chroma

Usage:
  ornata key <KEY|GROUP|k1,k2> <hex> [...] [--bg <hex>] [--bright 0..100]
                                         light keys/groups on a background
  ornata apply <scene.json>              apply a scene (background, keys, groups, brightness)
  ornata all <hex> [--bright 0..100]     set the whole keyboard to one color
  ornata brightness <0..100>             set keyboard brightness only
  ornata off                             turn all keys off
  ornata groups                          list built-in key groups
  ornata list                            list all key names and coordinates
  ornata walk [ms]                       light each matrix cell in turn (mapping aid)
  ornata devices                         list detected Razer devices

Targets can be a key name (W, ESC, SPACE, LEFT), a symbol (';', '/'),
a "row,col" coordinate, a group (WASD, ARROWS, LETTERS, FKEYS, NUMPAD,
MODIFIERS, NAV, ALL), or a comma list (W,A,S,D).
Colors are hex: ff0000, #ff0000 or #f00. Brightness is a percentage 0..100.

NOTE: quit the "Razer macOS" menu-bar app first — it holds the keyboard open.`);
}

function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  try {
    switch (cmd) {
      case 'apply': return cmdApply(rest[0]);
      case 'key': return cmdKeys(rest);
      case 'all': return cmdAll(rest);
      case 'off': return cmdOff();
      case 'brightness':
      case 'bright': return cmdBrightness(rest[0]);
      case 'groups': return cmdGroups();
      case 'walk': return cmdWalk(rest[0]);
      case 'list': return cmdList();
      case 'devices': return cmdDevices();
      case undefined:
      case '-h':
      case '--help':
      case 'help': return usage();
      default:
        console.error(`unknown command: ${cmd}\n`);
        return usage();
    }
  } catch (e) {
    fail(e.message);
  }
}

main();
