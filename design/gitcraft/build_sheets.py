"""Pack MeshCraft specimen frames into the sprite sheets PRIMORDIA loads (public/assets/life/).

  python3 design/gitcraft/build_sheets.py <frames_dir>

Each specimen becomes a 4×4 sheet of 16 loop frames, `<name>-soft.webp` (defocused, 128px cells):
everything behind the playfield is off the focal plane, and pre-blurring means the game never blurs
at runtime (iOS Safari has no canvas filter). Pass --sharp to also write full-resolution sheets.
"""
import json, os, sys
from PIL import Image, ImageFilter

src = [a for a in sys.argv[1:] if not a.startswith('--')][0]
out = os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'assets', 'life')
names = ['diatom', 'radiolarian', 'volvox', 'medusa', 'ctenophore']
meta = {}
for n in names:
    frames = sorted(f for f in os.listdir(src) if f.startswith(n + '_'))
    cell = Image.open(os.path.join(src, frames[0])).size[0]
    sheet = Image.new('RGBA', (cell * 4, cell * 4))
    for i, f in enumerate(frames[:16]):
        sheet.paste(Image.open(os.path.join(src, f)).convert('RGBA'), ((i % 4) * cell, (i // 4) * cell))
    if '--sharp' in sys.argv: sheet.save(os.path.join(out, n + '.webp'), 'WEBP', quality=82, method=6)
    soft = sheet.resize((cell * 2, cell * 2), Image.LANCZOS).filter(ImageFilter.GaussianBlur(2.2))
    soft.save(os.path.join(out, n + '-soft.webp'), 'WEBP', quality=78, method=6)
    meta[n] = {'frames': 16, 'cols': 4, 'cell': cell // 2}
json.dump(meta, open(os.path.join(out, 'sheets.json'), 'w'), indent=1)
print(meta)
