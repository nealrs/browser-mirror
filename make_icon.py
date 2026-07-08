"""Generate hand-mirror icons (icon16/32/48/128.png) with no dependencies.

Two colors on a transparent background: a blue frame + handle, pale glass.
Renders a 768x768 master via per-pixel shape tests, then box-downsamples
(768 is divisible by 16, 32, 48 and 128... well, 768/128 = 6, 768/48 = 16,
768/32 = 24, 768/16 = 48 — all integer, so downsampling stays crisp).
"""
import struct, zlib

MASTER = 768

FRAME = (0x3D, 0x7E, 0xDB)   # blue frame + handle
GLASS = (0xD9, 0xEC, 0xFF)   # pale glass

# geometry in unit space
CX, CY   = 0.5, 0.40   # mirror center
R_OUT    = 0.335       # outer frame radius
R_GLASS  = 0.250       # glass radius
HW       = 0.062       # handle half-width
HY0, HY1 = 0.60, 0.895 # handle top / bottom (bottom gets a round cap)

def sample(x, y):
    """Return RGBA for a unit-space point."""
    dx, dy = x - CX, y - CY
    d2 = dx * dx + dy * dy
    if d2 <= R_GLASS * R_GLASS:
        return (*GLASS, 255)
    if d2 <= R_OUT * R_OUT:
        return (*FRAME, 255)
    # handle: vertical capsule
    if abs(x - 0.5) <= HW and HY0 <= y <= HY1:
        return (*FRAME, 255)
    hx, hy = x - 0.5, y - HY1
    if hx * hx + hy * hy <= HW * HW:
        return (*FRAME, 255)
    return (0, 0, 0, 0)

def render_master(n):
    px = bytearray(n * n * 4)
    inv = 1.0 / n
    for j in range(n):
        y = (j + 0.5) * inv
        row = j * n * 4
        for i in range(n):
            r, g, b, a = sample((i + 0.5) * inv, y)
            o = row + i * 4
            px[o], px[o+1], px[o+2], px[o+3] = r, g, b, a
    return px

def downsample(px, n, size):
    """Box-filter n×n RGBA down to size×size (n divisible by size)."""
    f = n // size
    area = f * f
    out = bytearray(size * size * 4)
    for j in range(size):
        for i in range(size):
            rs = gs = bs = as_ = 0
            for jj in range(j * f, (j + 1) * f):
                base = (jj * n + i * f) * 4
                for ii in range(f):
                    o = base + ii * 4
                    a = px[o+3]
                    rs += px[o] * a; gs += px[o+1] * a
                    bs += px[o+2] * a; as_ += a
            o = (j * size + i) * 4
            if as_:
                out[o]   = rs // as_
                out[o+1] = gs // as_
                out[o+2] = bs // as_
            out[o+3] = as_ // area
    return out

def write_png(path, px, size):
    def chunk(tag, data):
        c = tag + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c))
    raw = b''.join(b'\x00' + bytes(px[j*size*4:(j+1)*size*4]) for j in range(size))
    png = (b'\x89PNG\r\n\x1a\n'
           + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0))
           + chunk(b'IDAT', zlib.compress(raw, 9))
           + chunk(b'IEND', b''))
    with open(path, 'wb') as fh:
        fh.write(png)

master = render_master(MASTER)
for size in (16, 32, 48, 128):
    write_png(f'icon{size}.png', downsample(master, MASTER, size), size)
    print(f'icon{size}.png written')
