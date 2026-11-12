#!/usr/bin/env -S uv run --with pillow --with numpy python
from pathlib import Path
import random

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SIZE = 2048
WIDTH = 128
rng = random.Random(25017)
source = Image.open(ROOT / 'scripts/wood-grain-source.jpg').convert('RGB')
# Interior samples avoid the original board edges and joints.
samples = [(20, 30, 75, 350), (110, 30, 75, 350), (210, 30, 70, 350),
           (305, 30, 65, 350), (390, 30, 70, 350), (570, 30, 65, 350),
           (810, 30, 55, 350), (1140, 30, 60, 350)]
samples = [source.crop(tuple(round(v * 1.28) for v in (x, y, x + w, y + h))) for x, y, w, h in samples]

def distance(a, b):
    d = abs(a - b)
    return min(d, SIZE - d)

# Three cyclic boards per column, with joint spacing checked across the tile boundary too.
while True:
    columns = []
    for col in range(16):
        for attempt in range(10000):
            lengths = [rng.randint(450, 900), rng.randint(450, 900)]
            lengths.append(SIZE - sum(lengths))
            if not 427 <= lengths[2] <= 1200:
                continue
            start = rng.randrange(SIZE)
            joints = [start, (start + lengths[0]) % SIZE, (start + sum(lengths[:2])) % SIZE]
            neighbors = columns[max(0, col - 2):col]
            if all(distance(a, b) >= (145 if i == len(neighbors) - 1 else 100)
                   for i, neighbor in enumerate(neighbors) for a in joints for b in neighbor[0]):
                columns.append((joints, lengths))
                break
        else:
            break
    if len(columns) == 16 and all(distance(a, b) >= limit for i, j, limit in [(15, 0, 145), (14, 0, 100), (15, 1, 100)] for a in columns[i][0] for b in columns[j][0]):
        break

canvas = np.zeros((SIZE, SIZE, 3), dtype=np.uint8)
for col, (joints, lengths) in enumerate(columns):
    for start, length in zip(joints, lengths):
        sample = rng.choice(samples)
        if rng.random() < .5:
            sample = sample.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
        if rng.random() < .5:
            sample = sample.transpose(Image.Transpose.FLIP_TOP_BOTTOM)
        grain = np.asarray(sample.resize((WIDTH - 2, length), Image.Resampling.LANCZOS), dtype=np.float32)
        luminance = grain @ np.array([.299, .587, .114], dtype=np.float32)
        detail = np.clip((luminance - luminance.mean()) * .55, -24, 24)
        light = rng.uniform(-12, 12)
        warm = rng.uniform(2, 8) if rng.random() < .18 else rng.uniform(-3, 2)
        color = np.array([202 + warm, 190 + warm * .3, 171 - warm * .3]) + light
        board = np.clip(color + detail[..., None], 0, 255).astype(np.uint8)
        rows = (np.arange(length) + start) % SIZE
        canvas[rows, col * WIDTH + 1: (col + 1) * WIDTH - 1] = board
        canvas[start, col * WIDTH + 1: (col + 1) * WIDTH - 1] = np.clip(color - 22, 0, 255)
    canvas[:, col * WIDTH:col * WIDTH + 1] = (158, 147, 132)
    canvas[:, (col + 1) * WIDTH - 1:(col + 1) * WIDTH] = (158, 147, 132)
Image.fromarray(canvas).save(ROOT / 'apps/ui/static/wood-floor.jpg', quality=95, subsampling=0)
