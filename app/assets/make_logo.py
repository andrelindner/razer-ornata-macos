#!/usr/bin/env python3
"""Modern wordmark logo for the Ornata support redesign. Rendered with PIL and
the Avenir Next system font. Neon-green keycap/power mark + 'ORNATA' wordmark."""
import math
from PIL import Image, ImageDraw, ImageFont

SP = "/private/tmp/claude-501/-Users-andre-Applications-Projekte-Razor-Synapse/39b1b00c-ea5a-4e32-9891-56c24c8d3fbe/scratchpad/"
FONT = "/System/Library/Fonts/Avenir Next.ttc"
NEON = (0x33, 0xff, 0x57)
INK = (0xf1, 0xf6, 0xf1)
MUTE = (0x93, 0x9c, 0xaa)
W, H = 1240, 360
S = 3  # supersample


def font(sz, idx=0):
    return ImageFont.truetype(FONT, sz * S, index=idx)


def tracked_width(d, text, f, tr):
    return sum(d.textlength(c, font=f) for c in text) + tr * S * (len(text) - 1)


def draw_tracked(d, x, y, text, f, fill, tr, anchor_ls="ls"):
    for c in text:
        d.text((x, y), c, font=f, fill=fill, anchor=anchor_ls)
        x += d.textlength(c, font=f) + tr * S
    return x


def rcap_line(d, p0, p1, w, fill):
    d.line([p0, p1], fill=fill, width=int(w))
    r = w / 2
    for (x, y) in (p0, p1):
        d.ellipse([x - r, y - r, x + r, y + r], fill=fill)


def draw_mark(d, x, y, s):
    u = s / 260.0
    # keycap base + top surface
    d.rounded_rectangle([x, y, x + s, y + s], radius=54 * u, fill=(0x0d, 0x0f, 0x13),
                        outline=(0x1c, 0x5e, 0x2b), width=int(4 * u))
    d.rounded_rectangle([x + 20 * u, y + 16 * u, x + s - 20 * u, y + s - 30 * u],
                        radius=40 * u, fill=(0x15, 0x18, 0x1e),
                        outline=(0x2b, 0x31, 0x3b), width=int(2 * u))
    # power symbol: ring with a gap at the top + vertical bar
    cx, cy, r = x + s / 2, y + s / 2 - 4 * u, 66 * u
    lw = 17 * u
    d.arc([cx - r, cy - r, cx + r, cy + r], start=305, end=595, fill=NEON, width=int(lw))
    for ang in (305, 235):
        ex, ey = cx + r * math.cos(math.radians(ang)), cy + r * math.sin(math.radians(ang))
        rr = lw / 2
        d.ellipse([ex - rr, ey - rr, ex + rr, ey + rr], fill=NEON)
    rcap_line(d, (cx, cy - r - 14 * u), (cx, cy - 6 * u), lw, NEON)


def build(dark=True):
    img = Image.new("RGBA", (W * S, H * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if dark:
        for i in range(H * S):
            t = i / (H * S - 1)
            c = tuple(int(a + (b - a) * t) for a, b in
                      zip((0x1a, 0x1d, 0x23), (0x0b, 0x0c, 0x0f)))
            d.line([(0, i), (W * S, i)], fill=c + (255,))

    draw_mark(d, 48 * S, 50 * S, 260 * S)

    # wordmark
    wf = font(150, idx=0)  # Avenir Next Bold
    tx = 372 * S
    base_y = 214 * S
    tr = 2
    endx = draw_tracked(d, tx, base_y, "ORNATA", wf, INK, tr)
    wordw = endx - tx - tr * S

    # neon underline + trailing dot
    uy = 246 * S
    d.rounded_rectangle([tx + 4 * S, uy, tx + 4 * S + wordw, uy + 10 * S],
                        radius=5 * S, fill=NEON)
    dotx = tx + 4 * S + wordw + 16 * S
    d.rounded_rectangle([dotx, uy, dotx + 10 * S, uy + 10 * S], radius=2 * S, fill=NEON)

    # tagline
    tf = font(29, idx=2)  # Avenir Next Demi Bold
    draw_tracked(d, tx + 6 * S, 300 * S, "SYNAPSE  REDESIGN  ·  macOS  LIGHTING",
                 tf, MUTE, 6)

    return img.resize((W, H), Image.LANCZOS)


def main():
    for name, dark in (("logo_dark", True), ("logo_trans", False)):
        img = build(dark=dark)
        img.save(SP + name + ".png")
        print("wrote", name + ".png")


main()
