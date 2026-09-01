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

LIT = {
    (0, 1): PURPLE,
    (1, 3): BLUE,
    (2, 0): GREEN,
    (2, 2): ORANGE,
    (3, 2): RED,
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

    key = 150 * sc
    gap = 26 * sc
    total = 4 * key + 3 * gap
    x0 = (n - total) / 2
    y0 = (n - total) / 2
    for row in range(4):
        for col in range(4):
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
    """Menu-bar template: solid 3x2 keycap glyph (black + alpha)."""
    ss = 8
    n = px * ss
    img = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    u = n / 22.0
    key, gap = 4.6 * u, 1.4 * u
    total_w = 3 * key + 2 * gap
    total_h = 2 * key + gap
    x0, y0 = (n - total_w) / 2, (n - total_h) / 2
    for row in range(2):
        for col in range(3):
            x = x0 + col * (key + gap)
            y = y0 + row * (key + gap)
            d.rounded_rectangle([x, y, x + key, y + key], radius=1.2 * u,
                                fill=(0, 0, 0, 255))
    return img.resize((px, px), Image.LANCZOS)


def build_logo(dark=True):
    W, H = 1400, 360
    n_w, n_h = W * SS, H * SS
    img = Image.new("RGBA", (n_w, n_h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if dark:
        for i in range(n_h):
            t = i / (n_h - 1)
            c = tuple(int(a + (b - a) * t) for a, b in
                      zip((0x1a, 0x1d, 0x23), (0x0b, 0x0c, 0x0f)))
            d.line([(0, i), (n_w, i)], fill=c + (255,))

    # mark: 2x2 mini key grid, one lit per profile color
    mk, mg = 104 * SS, 18 * SS
    mx, my = 64 * SS, (n_h - (2 * mk + mg)) / 2
    mini = {(0, 1): GREEN, (1, 0): PURPLE}
    for row in range(2):
        for col in range(2):
            x = mx + col * (mk + mg)
            y = my + row * (mk + mg)
            draw_key(d, x, y, mk, mini.get((row, col)))

    tx = mx + 2 * mk + mg + 62 * SS
    bold = ImageFont.truetype(FONT, 122 * SS, index=0)     # Bold
    demi = ImageFont.truetype(FONT, 122 * SS, index=2)     # Demi Bold
    small = ImageFont.truetype(FONT, 30 * SS, index=2)
    ink = (0xf2, 0xf6, 0xf2)
    y_word = n_h * 0.44
    d.text((tx, y_word), "Ornata", font=bold, fill=ink, anchor="lm")
    w1 = d.textlength("Ornata", font=bold)
    d.text((tx + w1 + 34 * SS, y_word), "Lighting", font=demi, fill=GREEN, anchor="lm")
    # tagline
    d.text((tx + 6 * SS, n_h * 0.75), "P E R - K E Y   R G B   ·   m a c O S",
           font=small, fill=(0x8d, 0x96, 0xa4), anchor="lm")

    return img.resize((W, H), Image.LANCZOS)


def main():
    build_icon().save(SP + "keys_1024.png")
    build_tray(22).save(SP + "tray_22.png")
    build_tray(44).save(SP + "tray_44.png")
    build_logo(dark=True).save(SP + "logo_dark.png")
    build_logo(dark=False).save(SP + "logo_trans.png")
    print("wrote keys_1024.png, tray, logos")


main()
