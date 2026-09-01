#!/usr/bin/env python3
"""App icon: the power button from the ORNATA logo, with the letters 'RSO'
(Razer Synapse Ornata) integrated inside the power ring. Neon on anthracite."""
import math
from PIL import Image, ImageDraw, ImageFont

SP = "/private/tmp/claude-501/-Users-andre-Applications-Projekte-Razor-Synapse/39b1b00c-ea5a-4e32-9891-56c24c8d3fbe/scratchpad/"
FONT = "/System/Library/Fonts/Avenir Next.ttc"
NEON = (0x33, 0xff, 0x57)
INK = (0xf2, 0xf7, 0xf2)
S = 1024


def lerp(a, b, t):
    return tuple(int(x + (y - x) * t) for x, y in zip(a, b))


def bg(size):
    top, bot = (0x22, 0x26, 0x2e), (0x0a, 0x0b, 0x0d)
    cx, cy = size / 2, size * 0.44
    maxd = math.hypot(size, size) * 0.62
    px = []
    for y in range(size):
        for x in range(size):
            d = math.hypot(x - cx, y - cy) / maxd
            px.append(lerp(top, bot, min(1, d)))
    im = Image.new("RGB", (size, size)); im.putdata(px)
    return im.convert("RGBA")


def rcap_line(d, p0, p1, w, fill):
    d.line([p0, p1], fill=fill, width=int(w)); r = w / 2
    for p in (p0, p1):
        d.ellipse([p[0]-r, p[1]-r, p[0]+r, p[1]+r], fill=fill)


def power_ring(d, cx, cy, R, lw, color, gap_deg=76):
    start = 270 + gap_deg / 2
    end = 270 - gap_deg / 2 + 360
    d.arc([cx-R, cy-R, cx+R, cy+R], start=start, end=end, fill=color, width=int(lw))
    for ang in (start, end):
        ex, ey = cx + R*math.cos(math.radians(ang)), cy + R*math.sin(math.radians(ang))
        r = lw/2; d.ellipse([ex-r, ey-r, ex+r, ey+r], fill=color)


def build(size, letters=True):
    ss = 3
    n = size * ss
    img = bg(n)
    d = ImageDraw.Draw(img)
    sc = n / S
    cx, cy = n/2, n*0.475
    R = 340*sc
    lw = 66*sc
    power_ring(d, cx, cy, R, lw, NEON)
    # top stub crossing the gap into the ring
    rcap_line(d, (cx, cy - R - 22*sc), (cx, cy - R + 104*sc), lw, NEON)
    if letters:
        f = ImageFont.truetype(FONT, int(266*sc), index=0)  # Avenir Next Bold
        d.text((cx, cy + 40*sc), "RSO", font=f, fill=INK, anchor="mm")
    img = img.resize((size, size), Image.LANCZOS)
    # squircle corners
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0,0,size-1,size-1], radius=int(size*0.225), fill=255)
    out = Image.new("RGBA", (size, size), (0,0,0,0))
    out.paste(img, (0,0), mask)
    ImageDraw.Draw(out).rounded_rectangle([2,2,size-3,size-3], radius=int(size*0.222),
                                          outline=(0x39,0xff,0x5a,45), width=3)
    return out


def build_tray(px):
    """Monochrome power-button template (black+alpha) for the menu bar."""
    ss = 8
    n = px * ss
    img = Image.new("RGBA", (n, n), (0,0,0,0))
    d = ImageDraw.Draw(img)
    sc = n / 22.0
    cx, cy, R, lw = n/2, n*0.54, 7.6*sc, 2.2*sc
    power_ring(d, cx, cy, R, lw, (0,0,0,255), gap_deg=80)
    rcap_line(d, (cx, cy - R - 1.6*sc), (cx, cy - R + 3.0*sc), lw, (0,0,0,255))
    return img.resize((px, px), Image.LANCZOS)


def main():
    build(S).save(SP + "rso_1024.png")
    build_tray(22).save(SP + "tray_22.png")
    build_tray(44).save(SP + "tray_44.png")
    print("wrote rso_1024.png + tray")


main()
