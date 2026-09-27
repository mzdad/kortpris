"""Draws Kortpris's app icons (the home screen picture) as PNG files, with plain Python only.

A yellow card with a blue picture window and two lines of text, on the app's dark blue - like the
little card at the top of the page. The card stays inside the middle 80% circle, so phones that cut
icons into circles or rounded squares ("maskable") never cut into it.

Run from the project folder: python dev_make_icons.py
"""
import math
import struct
import zlib

BACKGROUND = (0x14, 0x1C, 0x28)
CARD = (0xF5, 0xC5, 0x18)
ART = (0x7F, 0xA7, 0xE0)
TEXT_LINE = (0x14, 0x1C, 0x28)

# Shapes on a 512 x 512 icon: (x0, y0, x1, y1, corner radius, colour, opacity).
CARD_W, CARD_H = 236, 330
CX0, CY0 = (512 - CARD_W) / 2, (512 - CARD_H) / 2
SHAPES = [
    (CX0, CY0, CX0 + CARD_W, CY0 + CARD_H, 20, CARD, 1.0),
    (CX0 + 20, CY0 + 22, CX0 + CARD_W - 20, CY0 + 168, 7, ART, 1.0),
    (CX0 + 20, CY0 + 196, CX0 + 170, CY0 + 212, 8, TEXT_LINE, 0.55),
    (CX0 + 20, CY0 + 226, CX0 + 124, CY0 + 242, 8, TEXT_LINE, 0.55),
]


def rounded_box_distance(px, py, box):
    """How far a point is outside a rounded box (negative inside), in the same units."""
    x0, y0, x1, y1, radius = box
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    qx = abs(px - cx) - ((x1 - x0) / 2 - radius)
    qy = abs(py - cy) - ((y1 - y0) / 2 - radius)
    outside = math.hypot(max(qx, 0), max(qy, 0))
    return outside + min(max(qx, qy), 0) - radius


def draw(size):
    scale = size / 512
    rows = []
    for y in range(size):
        row = bytearray()
        for x in range(size):
            red, green, blue = BACKGROUND
            for x0, y0, x1, y1, radius, colour, opacity in SHAPES:
                box = (x0 * scale, y0 * scale, x1 * scale, y1 * scale, radius * scale)
                # Smooth edges: a pixel half inside the shape is half covered.
                cover = min(max(0.5 - rounded_box_distance(x + 0.5, y + 0.5, box), 0), 1) * opacity
                if cover > 0:
                    red = red + (colour[0] - red) * cover
                    green = green + (colour[1] - green) * cover
                    blue = blue + (colour[2] - blue) * cover
            row += bytes((round(red), round(green), round(blue), 255))
        rows.append(row)
    return rows


def write_png(path, rows):
    size = len(rows)
    raw = b"".join(b"\x00" + bytes(row) for row in rows)   # filter type 0 on every row

    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")
    with open(path, "wb") as file:
        file.write(png)


for name, size in [("icon-512.png", 512), ("icon-192.png", 192), ("apple-touch-icon.png", 180)]:
    write_png(name, draw(size))
    print("wrote", name)
