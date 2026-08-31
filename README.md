# razer-ornata-macos

Per-key RGB lighting for the **Razer Ornata Chroma** (PID `0x021E`) on macOS —
including Apple Silicon and macOS 26 (Tahoe), where it was developed and tested.

## Why this exists

Razer **Synapse 4 for Mac does not support the Ornata Chroma** — Synapse loads a
per-device UI module from Razer's servers for each supported product, and no
module was ever published for the classic Ornata. The device works as a plain
keyboard, but you get no lighting control.

The community app [**razer-macos**](https://github.com/stickoking/razer-macos)
*does* drive the Ornata, but only with whole-keyboard effects (static, wave,
spectrum, breathe, reactive, ripple). It has **no way to light individual keys
with your own colors**.

This tool fills that gap. The Ornata's hardware accepts a full custom lighting
frame over a **6×22 matrix**, and razer-macos already sends such frames for its
ripple effect — it just never exposes static per-key control. We reuse that same
path to let you paint any key any color.

## Requirements

- A Mac with the **Razer Ornata Chroma** connected.
- **razer-macos installed** (we borrow its native addon):
  download the DMG from
  [stickoking/razer-macos releases](https://github.com/stickoking/razer-macos/releases)
  and drag `Razer macOS.app` into `/Applications`.
- **Node.js 18+** (`node --version`).

> Nothing here needs Input Monitoring or Accessibility permission — those are only
> for reading keystrokes. Writing lighting frames does not.

## Setup

```bash
git clone https://github.com/andrelindner/razer-ornata-macos.git
cd razer-ornata-macos
./setup.sh          # extracts addon.node from /Applications/Razer macOS.app
```

`addon.node` is the native module from razer-macos (GPL). It is **not** committed
to this repo; `setup.sh` copies it out of the app you installed.

## Important: quit the Razer app first

The razer-macos menu-bar app opens the keyboard **exclusively**. While it runs,
this tool cannot talk to the device (`Unable to open USB device`). Quit it before
using the commands below (menu-bar icon → Quit, or `osascript -e 'quit app "Razer macOS"'`).

## Usage

```bash
# Light specific keys / groups on a background color
node src/ornata.js key WASD ff2020 ARROWS 0000ff SPACE 00ff00 --bg 0a0a2a

# Assign one color to a comma-separated list of keys
node src/ornata.js key J,K,L,SEMICOLON 00ffcc

# Apply a saved scene (background, keys, groups, brightness)
node src/ornata.js apply scenes/gaming.json

# Whole keyboard one color, at 60% brightness
node src/ornata.js all 6600ff --bright 60

# Brightness only (0..100 %)
node src/ornata.js brightness 80

# Everything off
node src/ornata.js off

# List built-in groups / all key names / detected devices
node src/ornata.js groups
node src/ornata.js list
node src/ornata.js devices

# Light each matrix cell in turn — helps you map physical keys to coordinates
node src/ornata.js walk 400
```

Colors are hex: `ff0000`, `#ff0000`, or short `#f00`.
Brightness is a percentage `0..100`.

### Targeting keys

A target can be any of:
- **key name** — `W`, `ESC`, `SPACE`, `ENTER`, `LSHIFT`, `UP`, `F1`, `KP0` …
- **symbol** — `` ` ``, `-`, `=`, `[`, `]`, `;`, `'`, `,`, `.`, `/`, `\`
- **digit** — `1`…`0` (top number row)
- **coordinate** — `"row,col"`, e.g. `"2,3"` is the W key
- **comma list** — `W,A,S,D` (one color to many keys)
- **group** — a named set of keys (below)

### Groups

Assign one color to a whole group at once:

| Group | Keys |
|-------|------|
| `WASD` | W A S D |
| `ARROWS` | ↑ ↓ ← → |
| `LETTERS` | A–Z |
| `FKEYS` | F1–F12 |
| `NUMROW` | 1–0 |
| `NUMPAD` | the number pad |
| `MODIFIERS` | Shift/Ctrl/Alt/Win/Fn/Caps |
| `NAV` | Ins Home PgUp Del End PgDn |
| `ALL` | every key |

```bash
node src/ornata.js key FKEYS ff0000 WASD 00ff00 MODIFIERS 0000ff
```

Scenes can also define **their own groups** (see below).

Run `node src/ornata.js list` for the full key map. Not every matrix cell has a
physical key (the Ornata has gaps in the top-right/media area); unused cells stay
whatever the background sets.

## Scene files

A scene is JSON: an optional `brightness` (0..100), a `background`, optional
custom `groups`, and the `keys` you want colored. A key entry may target a single
key, a comma list, a built-in group, or one of your own groups:

```json
{
  "brightness": 80,
  "background": "#050510",
  "groups": {
    "movement": ["W", "A", "S", "D"],
    "abilities": ["Q", "E", "R", "F"]
  },
  "keys": {
    "movement": "#ff2020",
    "abilities": "#00c8ff",
    "SPACE": "#20ff20",
    "LSHIFT,LCTRL": "#ffaa00",
    "NUMROW": "#ff00ff",
    "ESC": "#ffffff"
  }
}
```

See [`scenes/`](scenes) for more examples (`wasd.json`, `arrows.json`, `gaming.json`).

## Notes & limitations

- The custom frame is shown at the keyboard's current **brightness**. If the
  board looks dark, raise it with `ornata brightness 100` (or the `--bright`
  flag / a scene's `"brightness"` field).
- The frame lives in the keyboard until you change it, set another effect, or
  power-cycle the board. Launching razer-macos again may overwrite it with its
  own saved effect, so use one or the other.
- Optional convenience: install as a command with `npm link`, then just run
  `ornata key W ff0000 …`.

## How it works

```
getAllDevices()                              find the Ornata (PID 542 / 0x021E)
kbdSetCustomFrame(id, [row,0,21, r,g,b …])   write one matrix row (×6)
kbdSetModeCustom(id)                         display the custom frame
```

The row payload format is `ROW_ID, START_COL, STOP_COL, N×RGB` — the OpenRazer
`matrix_custom_frame` protocol. The key→coordinate table in
[`src/layout.js`](src/layout.js) is taken from razer-macos's own ripple mapping,
so it matches the hardware.

## Credits & license

Built on the shoulders of:
- [OpenRazer](https://github.com/openrazer/openrazer) — the reverse-engineered protocol
- [librazermacos](https://github.com/stickoking/librazermacos) — the macOS port
- [razer-macos](https://github.com/stickoking/razer-macos) — the app whose native
  addon and matrix mapping this tool reuses

Because it derives from and links against that GPL code, this project is licensed
under the **GNU General Public License v2.0 or later**. See [LICENSE](LICENSE).

Not affiliated with or endorsed by Razer Inc. "Razer", "Ornata", and "Chroma"
are trademarks of Razer Inc.
