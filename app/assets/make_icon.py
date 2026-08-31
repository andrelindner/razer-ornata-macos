#!/usr/bin/env python3
"""Razer Ornata Lighting app icon: a neon-green Chinese dragon HEAD as an
outline (line art) on an anthracite background. Pure PIL, crisp, no blur."""
import math
from PIL import Image, ImageDraw

S = 1024
SS = 2  # supersample for crisp edges
OUT = "/private/tmp/claude-501/-Users-andre-Applications-Projekte-Razor-Synapse/39b1b00c-ea5a-4e32-9891-56c24c8d3fbe/scratchpad/icon_1024.png"

NEON = (0x3d, 0xff, 0x5a)
CASING = (0x03, 0x2a, 0x0e)
EYE = (0xff, 0xc7, 0x1f)


def lerp(a, b, t):
    return a + (b - a) * t


def lerp_rgb(c1, c2, t):
    return tuple(int(round(lerp(c1[i], c2[i], t))) for i in range(3))


def make_background(size):
    top, bot = (0x2c, 0x30, 0x38), (0x0a, 0x0b, 0x0d)
    cx, cy = size / 2, size / 2
    maxd = math.hypot(cx, cy)
    px = []
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2 * (size - 1))
            r, g, b = lerp_rgb(top, bot, t)
            d = math.hypot(x - cx, y - cy) / maxd
            v = 1.0 - 0.5 * d * d
            gl = max(0.0, 1.0 - (d / 0.6) ** 2) * 24
            px.append((int(r*v), int(g*v + gl*0.5), int(b*v + gl*0.2)))
    im = Image.new("RGB", (size, size)); im.putdata(px)
    return im.convert("RGBA")


def catmull(anchors, closed=False, samples=26):
    p = list(anchors)
    if closed:
        pts = [p[-1]] + p + [p[0], p[1]]
    else:
        pts = [p[0]] + p + [p[-1]]
    out = []
    segs = len(p) if closed else len(p) - 1
    for i in range(1, segs + 1):
        p0, p1, p2, p3 = pts[i-1], pts[i], pts[i+1], pts[i+2]
        for s in range(samples):
            t = s / samples
            t2, t3 = t*t, t*t*t
            x = 0.5*((2*p1[0]) + (-p0[0]+p2[0])*t + (2*p0[0]-5*p1[0]+4*p2[0]-p3[0])*t2 + (-p0[0]+3*p1[0]-3*p2[0]+p3[0])*t3)
            y = 0.5*((2*p1[1]) + (-p0[1]+p2[1])*t + (2*p0[1]-5*p1[1]+4*p2[1]-p3[1])*t2 + (-p0[1]+3*p1[1]-3*p2[1]+p3[1])*t3)
            out.append((x, y))
    if not closed:
        out.append(p[-1])
    return out


# ---- dragon head strokes, authored in 1024 space (snout faces upper-right) ----
# each: (anchors, w0, w1, closed)
STROKES = [
    # skull top -> snout ridge -> nostril curl
    ([(300,470),(330,372),(430,318),(556,318),(666,360),(742,410),(792,446),(806,486),(774,498),(748,476)], 15, 11, False),
    # upper lip / mouth roof (receding, open mouth)
    ([(756,494),(690,500),(628,494),(586,478),(560,452)], 12, 9, False),
    # lower jaw (open), forward fang tip
    ([(556,560),(634,576),(706,566),(752,536),(742,512)], 13, 9, False),
    # cheek / jaw hinge connecting skull back to lower jaw
    ([(322,470),(392,520),(482,556),(556,560)], 13, 12, False),
    # neck back line
    ([(300,470),(292,556),(324,636),(372,690)], 15, 11, False),
    # beard / chin wisp (single clean curl)
    ([(536,566),(500,606),(532,646),(500,684)], 11, 4, False),
    # brow ridge over the eye
    ([(408,392),(452,372),(512,388)], 11, 8, False),
]

# eye (closed almond)
EYE_LOOP = ([(430,420),(470,402),(508,418),(470,436)], 9, 9, True)

# horns (antlers) sweeping up and back, tapering
HORNS = [
    ([(356,344),(300,262),(250,192),(214,150)], 20, 5, False),
    ([(268,206),(316,182),(340,150)], 9, 4, False),   # branch
    ([(410,326),(372,236),(356,158)], 17, 4, False),  # second horn
]

# whiskers / barbels flowing off the snout
WHISKERS = [
    ([(802,472),(864,432),(902,360),(882,296),(906,244)], 11, 3, False),
    ([(806,500),(872,516),(930,502),(948,540)], 10, 3, False),
]

# mane flame spikes behind the head (clean, evenly fanned)
MANE = [
    ([(306,452),(244,410),(206,372)], 13, 4, False),
    ([(298,522),(230,512),(190,528)], 13, 4, False),
    ([(320,592),(266,624),(232,664)], 12, 4, False),
]

# fangs (small triangles as outlines)
FANGS = [
    ([(636,498),(650,540),(664,500)], 7, 7, True),   # upper
    ([(700,500),(712,536),(724,502)], 6, 6, True),   # upper
    ([(724,528),(736,500),(748,530)], 6, 6, True),   # lower
]


def render(size):
    img = make_background(size)
    d = ImageDraw.Draw(img)
    sc = size / S

    allstrokes = [*STROKES, EYE_LOOP, *HORNS, *WHISKERS, *MANE, *FANGS]
    sampled = []
    for anchors, w0, w1, closed in allstrokes:
        a = [(x*sc, y*sc) for x, y in anchors]
        pts = catmull(a, closed=closed, samples=30)
        n = len(pts)
        ws = [lerp(w0, w1, i/(n-1))*sc for i in range(n)]
        sampled.append((pts, ws))

    # pass 1: dark casing (for contrast on the lighter anthracite corner)
    for pts, ws in sampled:
        for (x, y), w in zip(pts, ws):
            r = w/2 + 4*sc
            d.ellipse([x-r, y-r, x+r, y+r], fill=CASING)
    # pass 2: neon line
    for pts, ws in sampled:
        for (x, y), w in zip(pts, ws):
            r = w/2
            d.ellipse([x-r, y-r, x+r, y+r], fill=NEON)

    # eye pupil (amber slit accent)
    ex, ey = 469*sc, 419*sc
    d.ellipse([ex-9*sc, ey-9*sc, ex+9*sc, ey+9*sc], fill=EYE)
    d.line([(ex-2*sc, ey-8*sc), (ex+2*sc, ey+8*sc)], fill=(0x1a,0x10,0x00), width=int(5*sc))
    return img


def render_tray(size):
    """Monochrome menu-bar template: bold head silhouette, black on alpha."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    sc = size / S
    # a bold, reduced subset that survives ~22px
    subset = [STROKES[0], STROKES[2], STROKES[3], HORNS[0], HORNS[2]]
    for anchors, w0, w1, closed in subset:
        a = [(x*sc, y*sc) for x, y in anchors]
        pts = catmull(a, closed=closed, samples=30)
        n = len(pts)
        for i, (x, y) in enumerate(pts):
            w = lerp(w0, w1, i/(n-1)) * sc * 1.7   # bolder for small size
            r = max(0.6, w/2)
            d.ellipse([x-r, y-r, x+r, y+r], fill=(0, 0, 0, 255))
    # eye dot
    d.ellipse([462*sc, 412*sc, 480*sc, 430*sc], fill=(0, 0, 0, 255))
    return img


def main():
    big = render(S*SS)
    img = big.resize((S, S), Image.LANCZOS)

    base = "/private/tmp/claude-501/-Users-andre-Applications-Projekte-Razor-Synapse/39b1b00c-ea5a-4e32-9891-56c24c8d3fbe/scratchpad/"
    for px in (22, 44):
        t = render_tray(S).resize((px, px), Image.LANCZOS)
        t.save(base + f"tray_{px}.png")
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0,0,S-1,S-1], radius=230, fill=255)
    out = Image.new("RGBA", (S, S), (0,0,0,0))
    out.paste(img, (0,0), mask)
    ImageDraw.Draw(out).rounded_rectangle([3,3,S-4,S-4], radius=227, outline=(0x39,0xff,0x5a,45), width=3)
    out.save(OUT); print("wrote", OUT)


main()
