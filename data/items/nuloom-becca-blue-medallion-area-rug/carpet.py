from pathlib import Path
import json

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageOps
from scipy.ndimage import gaussian_filter

ROOT = Path(__file__).resolve().parent
WIDTH, HEIGHT = 1600, 2000


def build():
    source = cv2.imread(str(ROOT / 'gallery-03.jpg'))
    main = cv2.imread(str(ROOT / 'main.jpg'))
    if source is None or main is None:
        raise FileNotFoundError('The full top-down gallery photo and main listing photo are required.')

    # This gallery image is already cropped to the binding; keep the entire design.
    h, w = source.shape[:2]
    corners = np.float32([[0, 0], [w - 1, 0], [w - 1, h - 1], [0, h - 1]])
    target = np.float32([[0, 0], [WIDTH - 1, 0], [WIDTH - 1, HEIGHT - 1], [0, HEIGHT - 1]])
    transform = cv2.getPerspectiveTransform(corners, target)
    rug = cv2.warpPerspective(source, transform, (WIDTH, HEIGHT), flags=cv2.INTER_CUBIC)
    lab = cv2.cvtColor(rug, cv2.COLOR_BGR2LAB).astype(np.float32)

    # Estimate illumination from pale yarn, rather than the dark medallion pattern.
    light = lab[:, :, 0]
    pale = np.clip((light - 185) / 35, 0, 1)
    denominator = gaussian_filter(pale, 160)
    pale_level = gaussian_filter(light * pale, 160) / np.maximum(denominator, 0.001)
    correction = np.clip(np.median(pale_level) - pale_level, -5, 5)
    lab[:, :, 0] = np.clip(light + correction, 0, 255)

    # Use exposed foreground rug pixels in the main photo for the yarn color cast.
    mask = np.zeros(main.shape[:2], np.uint8)
    cv2.fillPoly(mask, [np.array([
        (2, 332), (17, 330), (34, 346), (94, 354), (147, 339),
        (176, 307), (197, 304), (199, 340), (239, 340), (239, 319),
        (294, 323), (354, 302), (423, 319), (423, 333), (181, 416)
    ])], 1)
    main_lab = cv2.cvtColor(main, cv2.COLOR_BGR2LAB).astype(np.float32)
    main_pale = main_lab[(mask > 0) & (main_lab[:, :, 0] > 195)]
    source_pale = lab[lab[:, :, 0] > 210]
    shift = np.clip(np.median(main_pale[:, 1:], axis=0)
                    - np.median(source_pale[:, 1:], axis=0), -3, 3)
    lab[:, :, 1:] += shift
    bgr = cv2.cvtColor(np.clip(lab, 0, 255).astype(np.uint8), cv2.COLOR_LAB2BGR)
    texture = Image.fromarray(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))
    texture.save(ROOT / 'texture.png')
    note = {
        'note': "Rectified from the listing's complete top-down gallery photo to the 96 × 120-inch footprint, retaining the full medallion design and bound borders with no fringe. Pale-yarn colors were matched to the main listing photo, and broad lighting variation was flattened while preserving the pile texture."
    }
    (ROOT / 'texture.json').write_text(json.dumps(note, ensure_ascii=False) + '\n')

    preview = Image.new('RGB', (1300, 900), '#eceae6')
    draw = ImageDraw.Draw(preview)
    draw.text((30, 20), 'MAIN LISTING PHOTO', fill='#242424')
    draw.text((670, 20), 'TOP-DOWN TEXTURE - 96 x 120 in', fill='#242424')
    original = Image.open(ROOT / 'main.jpg').convert('RGB')
    original = ImageOps.contain(original, (600, 800), Image.Resampling.LANCZOS)
    flat = ImageOps.contain(texture, (600, 800), Image.Resampling.LANCZOS)
    preview.paste(original, (30, 50 + (800 - original.height) // 2))
    preview.paste(flat, (670, 50 + (800 - flat.height) // 2))
    preview.save(ROOT / 'preview.png')
    assert texture.size == (1600, 2000)
    print('Wrote texture.png (1600 x 2000), texture.json, and preview.png')


if __name__ == '__main__':
    build()
