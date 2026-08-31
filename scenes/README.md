# Scenes

A **scene** is a small JSON file describing a complete lighting layout. Apply one
with:

```bash
node src/ornata.js apply scenes/<name>.json
```

Each scene may contain:

| Field | Meaning |
|-------|---------|
| `brightness` | keyboard brightness `0..100` (optional) |
| `background` | hex colour for every key you don't name (optional, default black) |
| `groups` | your own named key groups, e.g. `{ "movement": ["W","A","S","D"] }` (optional) |
| `keys` | the colours: each entry maps a key, comma-list, built-in group, or your own group to a hex colour |

Targets and colours work exactly like the `ornata key` command — see the main
[README](../README.md#targeting-keys) for the full list of key names and built-in
groups (`WASD`, `ARROWS`, `LETTERS`, `FKEYS`, `NUMROW`, `NUMPAD`, `MODIFIERS`,
`NAV`, `ALL`).

## Bundled scenes

### `default.json` — the default profile

The layout applied by `setup.sh` on first install, and any time you run
`node src/ornata.js default`. It stays on the keyboard until you change it.

| Keys | Colour |
|------|--------|
| Function row (F1–F12) | bright purple `#c060ff` |
| Letters (A–Z) + number row (1–0) | vivid green `#00ff33` |
| Arrow keys | light blue `#33ccff` |
| Number pad | red `#ff0000` |
| Print Screen, Insert, Page Up + Scroll Lock, Pause, Home, Delete, End, Page Down | pink `#ff2e97` |

Brightness 100 %; all other keys off. Edit this file to change what "default"
means for you.

### `wasd.json`, `arrows.json`

Minimal examples: light just the movement keys on a dark background.

### `gaming.json`

Shows the richer features — custom `groups` (`movement`, `abilities`), a
comma-list target, a built-in group, and an explicit `brightness`.

## Making your own

Copy any file here, edit the colours, and apply it. There's nothing special
about these filenames — `apply` takes any path:

```bash
cp scenes/default.json scenes/mine.json
# edit scenes/mine.json
node src/ornata.js apply scenes/mine.json
```
