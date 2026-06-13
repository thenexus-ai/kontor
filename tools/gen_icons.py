#!/usr/bin/env python3
"""Generate FinDash PWA icons as PNGs (no external deps).

Draws an "ascending bars" finance mark in the app's brand palette.
Outputs into ../icons/. Re-run any time the palette changes.
"""
import os, zlib, struct

BD    = (0x5D, 0x45, 0xD9)   # --bd  brand purple (background)
PAPER = (0xF4, 0xEF, 0xE6)   # --paper (bars)
EQ    = (0xA9, 0x23, 0xA5)   # --eq  accent (tallest bar)

OUT = os.path.join(os.path.dirname(__file__), "..", "icons")


def png(path, w, h, rgba):
    """rgba: flat bytearray length w*h*4. Writes a PNG file."""
    def chunk(tag, data):
        c = tag + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xffffffff)
    raw = bytearray()
    stride = w * 4
    for y in range(h):
        raw.append(0)  # filter type 0 (None)
        raw.extend(rgba[y * stride:(y + 1) * stride])
    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)  # 8-bit RGBA
    idat = zlib.compress(bytes(raw), 9)
    with open(path, "wb") as f:
        f.write(sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b""))


def make(size, inset_frac, radius_frac):
    """Return rgba bytearray for one icon. inset_frac = padding for content
    (use ~0.10 for maskable safe-zone). radius_frac rounds the bg square."""
    buf = bytearray(size * size * 4)
    r = int(size * radius_frac)

    def inside_round(x, y):
        # full-bleed rounded square; corners transparent when radius_frac>0
        if r <= 0:
            return True
        for cx, cy in ((r, r), (size - r, r), (r, size - r), (size - r, size - r)):
            if (x < r or x >= size - r) and (y < r or y >= size - r):
                if (x - cx) ** 2 + (y - cy) ** 2 > r * r:
                    return False
        return True

    # bar geometry within the safe inset
    inset = int(size * inset_frac)
    inner = size - 2 * inset
    n = 3
    gap = int(inner * 0.10)
    bw = (inner - gap * (n - 1)) // n
    heights = [0.42, 0.66, 0.92]            # ascending
    base_y = size - inset                    # bottom of bars
    bars = []
    for i in range(n):
        bx = inset + i * (bw + gap)
        bh = int(inner * heights[i])
        by = base_y - bh
        col = EQ if i == n - 1 else PAPER
        bars.append((bx, bx + bw, by, base_y, col))

    for y in range(size):
        for x in range(size):
            o = (y * size + x) * 4
            if not inside_round(x, y):
                buf[o + 3] = 0
                continue
            col = BD
            for bx0, bx1, by0, by1, bc in bars:
                if bx0 <= x < bx1 and by0 <= y < by1:
                    col = bc
                    break
            buf[o], buf[o + 1], buf[o + 2], buf[o + 3] = col[0], col[1], col[2], 255
    return buf


def main():
    os.makedirs(OUT, exist_ok=True)
    # regular icons: slight rounding, normal inset
    for s in (192, 512):
        png(os.path.join(OUT, f"icon-{s}.png"), s, s, make(s, 0.20, 0.16))
    # maskable: full-bleed (no rounding), content inside 80% safe zone
    png(os.path.join(OUT, "icon-maskable-512.png"), 512, 512, make(512, 0.26, 0.0))
    # apple touch: full-bleed square (iOS applies its own mask), modest inset
    png(os.path.join(OUT, "apple-touch-180.png"), 180, 180, make(180, 0.20, 0.0))
    print("wrote icons to", os.path.normpath(OUT))


if __name__ == "__main__":
    main()
