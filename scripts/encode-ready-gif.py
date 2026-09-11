from pathlib import Path
from PIL import Image
import json

root = Path(__file__).resolve().parents[1] / 'output' / 'tom-ready'
frames = [Image.open(p).convert('RGB') for p in sorted((root / 'frames').glob('*.png'))]
# Share one palette across the loop to keep text and colors stable.
palette = frames[0].quantize(colors=128, method=Image.Quantize.MEDIANCUT)
indexed = [frame.quantize(palette=palette, dither=Image.Dither.NONE) for frame in frames]
gif = root / 'Tom-Ready.gif'
indexed[0].save(gif, save_all=True, append_images=indexed[1:], loop=0, duration=[120 if i % 2 == 0 else 130 for i in range(len(indexed))], disposal=2, optimize=True)
with Image.open(gif) as result:
    assert result.n_frames > 100 and result.size == (800, 480)
    assert result.info['loop'] == 0
    duration = 0
    for i in range(result.n_frames):
        result.seek(i)
        duration += result.info['duration']
    assert duration == 21000
    report = {'file': str(gif), 'width': 800, 'height': 480, 'frames': result.n_frames, 'renderedFrames': 168, 'fps': 8, 'seconds': duration / 1000, 'bytes': gif.stat().st_size}
(root / 'gif-check.json').write_text(json.dumps(report, indent=2))
print(json.dumps(report))
