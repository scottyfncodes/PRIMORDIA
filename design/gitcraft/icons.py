"""PRIMORDIA icon set — authored as path data, built and exported with GITCRAFT VectorCraft.

  python3 design/gitcraft/icons.py > /tmp/steps.json   (then run the steps through vectorcraft)

One 24×24 artboard per icon; strokes are round-capped 1.7pt, drawn in one ink so the game can
recolour them (currentColor). Exported SVGs land in design/gitcraft/icons/.
"""
import json, os, re
INK = '#e8fffa'
ICONS = {
  'energy': ['M12 3c3.6 4.2 6 7.4 6 10.4A6 6 0 0 1 6 13.4C6 10.4 8.4 7.2 12 3Z', 'M12.9 9.2l-2.5 3.7h3.1l-2.4 3.9'],
  'integrity': ['M12 3.6a8.4 8.4 0 1 0 0 16.8a8.4 8.4 0 1 0 0-16.8Z', 'M12 7.2a4.8 4.8 0 1 0 0 9.6a4.8 4.8 0 1 0 0-9.6Z', 'M12 3.6v3.6M12 16.8v3.6M3.6 12h3.6M16.8 12h3.6'],
  'breath': ['M10.5 6.5a6.5 6.5 0 1 0 0 13a6.5 6.5 0 1 0 0-13Z', 'M18 3a2.4 2.4 0 1 0 0 4.8a2.4 2.4 0 1 0 0-4.8Z', 'M7.2 12.4a3.4 3.4 0 0 1 2.9-2.9'],
  'burst': ['M17 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8Z', 'M2.5 9.4c1.5-1.3 3 1.3 4.5 0s3 1.3 4.5 0', 'M2.5 14.6c1.5-1.3 3 1.3 4.5 0s3 1.3 4.5 0', 'M4.5 12h5'],
  'engulf': ['M17.6 6.2A8.2 8.2 0 1 0 17.6 17.8', 'M17.6 6.2c-1.7.9-2.9 2.3-3.4 3.9', 'M17.6 17.8c-1.7-.9-2.9-2.3-3.4-3.9', 'M15.6 10.2a1.8 1.8 0 1 0 0 3.6a1.8 1.8 0 1 0 0-3.6Z'],
  'harden': ['M12 3.2l7.6 4.4v8.8L12 20.8l-7.6-4.4V7.6Z', 'M12 7.6l3.8 2.2v4.4L12 16.4l-3.8-2.2V9.8Z', 'M12 3.2v4.4M19.6 16.4l-3.8-2.2M4.4 16.4l3.8-2.2'],
  'pulse': ['M12 10a2 2 0 1 0 0 4a2 2 0 1 0 0-4Z', 'M7.4 7.4a6.5 6.5 0 0 0 0 9.2M16.6 7.4a6.5 6.5 0 0 1 0 9.2', 'M4.6 4.6a10.4 10.4 0 0 0 0 14.8M19.4 4.6a10.4 10.4 0 0 1 0 14.8'],
  'toxin': ['M12 6c2.7 3.2 4.5 5.7 4.5 8.2a4.5 4.5 0 0 1-9 0C7.5 11.7 9.3 9.2 12 6Z', 'M12 2.2v2M5.6 5.4l1.4 1.4M18.4 5.4L17 6.8', 'M11 13.2a1 1 0 1 0 0 2a1 1 0 1 0 0-2Z'],
  'strike': ['M5.5 19.5c0-7.2 4.3-12.4 12.8-14.6c-2.6 2.9-4.1 5.7-4.5 8.7', 'M9.4 14.6c2 .2 3.7 1.1 4.9 2.6', 'M13.8 13.6l2.6 1.2'],
  'ink': ['M7.6 17.4a3.6 3.6 0 0 1-.6-7.1a5.1 5.1 0 0 1 9.9-1.6a4.4 4.4 0 0 1 .5 8.7Z', 'M9 20.6h.01M13 21h.01M16.5 20.4h.01'],
  'tongue': ['M3 8.5h10c3.3 0 6 2.3 6 5.2s-2.4 4.6-5 4.6c-2.2 0-3.6-1.4-3.6-3.1s1.2-2.6 2.7-2.6'],
  'dna': ['M7.5 2.8c0 6 9 6 9 9.2s-9 3.2-9 9.2', 'M16.5 2.8c0 6-9 6-9 9.2s9 3.2 9 9.2', 'M9 6h6M9.6 12h4.8M9 18h6'],
  'growth': ['M8.6 7a5 5 0 1 0 0 10a5 5 0 1 0 0-10Z', 'M15.4 7a5 5 0 1 0 0 10a5 5 0 1 0 0-10Z'],
}


def shift(d, dx):
    """Move absolute x coordinates of a path by dx (artboard i sits at x = 40·i)."""
    toks = re.findall(r'[A-Za-z]|-?\d*\.?\d+(?:e-?\d+)?', d)
    out, cmd, idx = [], None, 0
    for t in toks:
        if t.isalpha():
            cmd, idx = t, 0; out.append(t); continue
        v = float(t)
        if cmd in 'MLCST': v += dx if idx % 2 == 0 else 0
        elif cmd == 'A' and idx % 7 == 5: v += dx
        elif cmd == 'H': v += dx
        idx += 1
        out.append(('%g' % v))
    return ' '.join(out)


steps = []
names = list(ICONS)
for i, name in enumerate(names):
    if i == 0:
        steps.append(['run_command', {'command': 'file.new', 'params': {'name': 'primordia-icons', 'width': 24, 'height': 24, 'units': 'Pixels'}}])
        steps.append(['run_command', {'command': 'artboard.setProps', 'params': {'index': 0, 'name': name}}])
    else:
        steps.append(['run_command', {'command': 'artboard.new', 'params': {'x': i * 40, 'y': 0, 'width': 24, 'height': 24, 'name': name}}])
    for d in ICONS[name]:
        steps.append(['draw_path', {'d': shift(d, i * 40), 'fill': 'none', 'stroke': INK, 'strokeWidth': 1.7, 'cap': 'round', 'join': 'round', 'name': name}])
here = os.path.dirname(os.path.abspath(__file__))
steps.append(['save_file', {'path': os.path.join(here, 'icons', 'primordia-icons.vectorcraft')}])
steps.append(['export', {'path': os.path.join(here, 'icons', 'icon.svg'), 'range': f'1-{len(names)}', 'outlineText': True}])
print(json.dumps({'names': names, 'steps': steps}))
