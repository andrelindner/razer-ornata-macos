#!/usr/bin/env python3
"""App icon + logo for Razer Ornata Lighting.

Icon: a 4x4 grid of keycaps on an anthracite squircle — a few keys lit in
vivid per-key RGB colors (the app's whole point). Crisp, flat, no blur.
Logo: the key mark + 'Ornata Lighting' wordmark.
"""
import math
from PIL import Image, ImageDraw, ImageFont

SP = "/private/tmp/claude-501/-Users-andre-Applications-Projekte-Razor-Synapse/39b1b00c-ea5a-4e32-9891-56c24c8d3fbe/scratchpad/"
FONT = "/System/Library/Fonts/Avenir Next.ttc"

S = 1024
SS = 2

# key colors (echo the default profile: purple / green / blue / red / orange)
PURPLE = (0xb0, 0x5c, 0xff)
GREEN = (0x2e, 0xf0, 0x5e)
BLUE = (0x3a, 0x9b, 0xff)
RED = (0xff, 0x40, 0x55)
ORANGE = (0xff, 0xa0, 0x2e)

KEY_BASE = (0x14, 0x17, 0x1c)
KEY_EDGE = (0x2a, 0x30, 0x3a)
KEY_FACE = (0x1c, 0x20, 0x28)

# 3x3 grid: five lit keys, loosely scattered so it reads organic, not rigid
LIT = {
    (0, 1): GREEN,
    (1, 0): BLUE,
    (1, 2): RED,
    (2, 1): ORANGE,
    (2, 2): PURPLE,
}


def scale_rgb(c, f):
    return tuple(min(255, int(x * f)) for x in c)


def bg(size):
    top, bot = (0x23, 0x26, 0x2d), (0x0a, 0x0b, 0x0e)
    cx, cy = size / 2, size * 0.42
    maxd = math.hypot(size, size) * 0.60
    px = []
    for y in range(size):
        for x in range(size):
            d = math.hypot(x - cx, y - cy) / maxd
            t = min(1.0, d)
            px.append(tuple(int(a + (b - a) * t) for a, b in zip(top, bot)))
    im = Image.new("RGB", (size, size))
    im.putdata(px)
    return im.convert("RGBA")


def draw_key(d, x, y, k, color=None):
    """One keycap at (x,y), size k. color=None -> unlit."""
    r = k * 0.19
    if color is None:
        d.rounded_rectangle([x, y, x + k, y + k], radius=r,
                            fill=KEY_BASE, outline=KEY_EDGE, width=max(2, int(k * 0.016)))
        d.rounded_rectangle([x + k * 0.09, y + k * 0.065,
                             x + k * 0.91, y + k * 0.83], radius=r * 0.72,
                            fill=KEY_FACE)
    else:
        d.rounded_rectangle([x, y, x + k, y + k], radius=r,
                            fill=scale_rgb(color, 0.42),
                            outline=scale_rgb(color, 0.85), width=max(2, int(k * 0.016)))
        d.rounded_rectangle([x + k * 0.09, y + k * 0.065,
                             x + k * 0.91, y + k * 0.83], radius=r * 0.72,
                            fill=color)
        # small specular tick, crisp
        d.rounded_rectangle([x + k * 0.16, y + k * 0.13,
                             x + k * 0.40, y + k * 0.22], radius=k * 0.045,
                            fill=scale_rgb(color, 1.35))


def build_icon(size=S):
    n = size * SS
    img = bg(n)
    d = ImageDraw.Draw(img)
    sc = n / S

    key = 196 * sc
    gap = 34 * sc
    total = 3 * key + 2 * gap
    x0 = (n - total) / 2
    y0 = (n - total) / 2
    for row in range(3):
        for col in range(3):
            x = x0 + col * (key + gap)
            y = y0 + row * (key + gap)
            draw_key(d, x, y, key, LIT.get((row, col)))

    img = img.resize((size, size), Image.LANCZOS)
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1],
                                           radius=int(size * 0.225), fill=255)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out


def build_tray(px):
    """Menu-bar template: solid 3x3 keycap glyph (black + alpha)."""
    ss = 8
    n = px * ss
    img = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    u = n / 22.0
    key, gap = 4.6 * u, 1.4 * u
    total_w = 3 * key + 2 * gap
    total_h = total_w
    x0, y0 = (n - total_w) / 2, (n - total_h) / 2
    for row in range(3):
        for col in range(3):
            x = x0 + col * (key + gap)
            y = y0 + row * (key + gap)
            d.rounded_rectangle([x, y, x + key, y + key], radius=1.2 * u,
                                fill=(0, 0, 0, 255))
    return img.resize((px, px), Image.LANCZOS)


def main():
    build_icon().save(SP + "keys_1024.png")
    build_tray(22).save(SP + "tray_22.png")
    build_tray(44).save(SP + "tray_44.png")
    print("wrote keys_1024.png + tray")


main()
