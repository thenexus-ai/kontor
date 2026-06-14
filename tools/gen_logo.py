#!/usr/bin/env python3
"""Kontor logo — a 'K' monogram in the brand palette, anti-aliased.

Pure Python (no deps). Supersamples (SS x SS) then box-downsamples for smooth
edges/diagonals. Usage: python3 gen_logo.py  -> writes preview PNGs to /tmp.
"""
import os, zlib, struct, math

# Default profile = "teal": eq=#0f8c84 (teal), bd=#6f9c3c (olive green).
TEAL  = (0x0f, 0x8c, 0x84)   # background (the app's primary "eq")
OLIVE = (0x6f, 0x9c, 0x3c)   # accent (the app's secondary "bd")
PAPER = (0xF4, 0xEF, 0xE6)   # the K


def png(path, w, h, rgba):
    def chunk(tag, data):
        c = tag + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xffffffff)
    raw = bytearray()
    for y in range(h):
        raw.append(0)
        raw.extend(rgba[y * w * 4:(y + 1) * w * 4])
    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)
    with open(path, "wb") as f:
        f.write(sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(bytes(raw), 9)) + chunk(b"IEND", b""))


def seg_dist(px, py, x0, y0, x1, y1):
    dx, dy = x1 - x0, y1 - y0
    L2 = dx * dx + dy * dy
    t = 0.0 if L2 == 0 else max(0.0, min(1.0, ((px - x0) * dx + (py - y0) * dy) / L2))
    return math.hypot(px - (x0 + t * dx), py - (y0 + t * dy))


def rounded_box(u, v, r):
    qx = abs(u - 0.5) - (0.5 - r)
    qy = abs(v - 0.5) - (0.5 - r)
    return math.hypot(max(qx, 0), max(qy, 0)) + min(max(qx, qy), 0) - r  # <=0 inside


def render(size, ss=3, radius=0.20, twotone=True, full_bleed=False, pad=0.0):
    # K geometry in unit square (optionally inset by pad for maskable safe-zone)
    def L(a):  # map [0,1] design coord into the padded content box
        return pad + a * (1 - 2 * pad)
    # geometry centred so the visual ink (incl. rounded arm-caps) is centred
    sx0, sx1 = L(0.24), L(0.37)          # stem
    sy0, sy1 = L(0.24), L(0.76)
    jx, jy   = L(0.37), L(0.50)          # junction (right of stem, mid)
    ax, ay   = L(0.70), L(0.24)          # upper arm end
    bx, by   = L(0.70), L(0.76)          # lower leg end
    half     = 0.065 * (1 - 2 * pad)     # half stroke thickness
    buf = bytearray(size * size * 4)
    for oy in range(size):
        for ox in range(size):
            rs = gs = bs = opaque = 0
            for syi in range(ss):
                for sxi in range(ss):
                    u = (ox + (sxi + 0.5) / ss) / size
                    v = (oy + (syi + 0.5) / ss) / size
                    if not full_bleed and rounded_box(u, v, radius) > 0:
                        continue  # transparent outside rounded square
                    col = TEAL
                    if (sx0 <= u <= sx1 and sy0 <= v <= sy1) or seg_dist(u, v, jx, jy, ax, ay) <= half:
                        col = PAPER
                    elif seg_dist(u, v, jx, jy, bx, by) <= half:
                        col = OLIVE if twotone else PAPER
                    rs += col[0]; gs += col[1]; bs += col[2]; opaque += 1
            n = ss * ss
            o = (oy * size + ox) * 4
            if opaque:
                buf[o], buf[o+1], buf[o+2] = rs // opaque, gs // opaque, bs // opaque
            buf[o+3] = round(255 * opaque / n)
    return buf


if __name__ == "__main__":
    out = os.path.join(os.path.dirname(__file__), "..", "icons")
    os.makedirs(out, exist_ok=True)
    # rounded-square app icons (transparent corners)
    png(os.path.join(out, "icon-192.png"), 192, 192, render(192, twotone=True, radius=0.20))
    png(os.path.join(out, "icon-512.png"), 512, 512, render(512, twotone=True, radius=0.20))
    # maskable: full-bleed teal, K inside the 80% safe zone
    png(os.path.join(out, "icon-maskable-512.png"), 512, 512, render(512, twotone=True, full_bleed=True, pad=0.16))
    # apple-touch: full-bleed square (iOS rounds it), slight breathing room
    png(os.path.join(out, "apple-touch-180.png"), 180, 180, render(180, twotone=True, full_bleed=True, pad=0.05))
    print("wrote Kontor icons to", os.path.normpath(out))
