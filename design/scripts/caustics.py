"""Seamless, looping underwater caustics for PRIMORDIA (public/assets/fx/caustics.webp).

Light refracted through a rippling surface is splatted onto the floor (photon mapping).
Wave vectors are whole multiples of the tile and frequencies whole multiples of the loop,
so the texture tiles in space and loops in time with no seams.
  python3 design/scripts/caustics.py
"""
import os
import numpy as np
from PIL import Image, ImageFilter

N, F, SUB = 256, 12, 3          # tile size, frames, photons per pixel per axis
rng = np.random.default_rng(11)
waves = []
for _ in range(9):
    kx, ky = rng.integers(-6, 7, 2)
    if kx == 0 and ky == 0: kx = 1
    waves.append((kx, ky, rng.uniform(0.5, 1.0) / np.hypot(kx, ky) ** 0.9, rng.integers(1, 3) * rng.choice([-1, 1]), rng.uniform(0, 2 * np.pi)))
g = (np.arange(N * SUB) + 0.5) / (N * SUB)
X, Y = np.meshgrid(g, g)
frames = []
for f in range(F):
    t = f / F
    gx = np.zeros_like(X); gy = np.zeros_like(X)
    for kx, ky, a, w, ph in waves:
        arg = 2 * np.pi * (kx * X + ky * Y + w * t) + ph
        c = a * np.cos(arg) * 2 * np.pi
        gx += c * kx; gy += c * ky
    s = 0.0055
    qx = ((X + s * gx) % 1 * N).astype(int) % N
    qy = ((Y + s * gy) % 1 * N).astype(int) % N
    img = np.zeros((N, N)); np.add.at(img, (qy, qx), 1.0)
    img /= SUB * SUB
    frames.append(img)
stack = np.stack(frames)
lo, hi = np.percentile(stack, 30), np.percentile(stack, 99.5)
sheet = Image.new('L', (N * 4, N * 3))
for i, img in enumerate(frames):
    v = np.clip((img - lo) / (hi - lo), 0, 1) ** 1.6
    im = Image.fromarray((v * 255).astype(np.uint8))
    # soften with wrap-around so the tile stays seamless
    big = Image.new('L', (N * 3, N * 3))
    for dx in range(3):
        for dy in range(3): big.paste(im, (dx * N, dy * N))
    im = big.filter(ImageFilter.GaussianBlur(1.1)).crop((N, N, 2 * N, 2 * N))
    sheet.paste(im, ((i % 4) * N, (i // 4) * N))
out = os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'assets', 'fx')
os.makedirs(out, exist_ok=True)
sheet.convert('RGB').save(os.path.join(out, 'caustics.webp'), 'WEBP', quality=80, method=6)
print('ok', sheet.size)
