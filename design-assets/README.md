# Tom kernel artwork

These are exports of the same tiny procedural drawing used in the UI. They contain no fonts, external artwork or generated photographic content.

- `kernel-still.png`: transparent 512 × 512 emerald/cyan avatar.
- `kernel-review.png`: transparent 512 × 512 amber review state.
- `kernel-frames/00.png` through `59.png`: sixty transparent 128 × 128 frames; play at 15 frames per second for a four-second cycle.
- `kernel-spritesheet.png`: ten columns × six rows, left to right then top to bottom, 128-pixel cells.
- `kernel.svg`: editable vector still.
- `kernel.ico`: Windows application icon, made from the bitmap still.

The ordinary PNG files are the starting point for Photoshop CS2 or ImageReady. Keep the transparent background when painting your variants. The sprite sheet is a reference for all frames; the separate frames are available for assembling an animation in your editor.

The shipped UI uses canvas, so it does not decode or load sixty PNGs. Only two small canvases redraw during activity. A cycle changes opacity slowly from 20% to 100%; 15 Hz is the drawing rate, not a 15-flash-per-second effect. The 1-pixel scan line stays inside the small active avatar. Idle breathing uses 8 frames per second and a seven-second cycle. Animation stops while the document is hidden and when reduced motion is requested. Active phases use a 3.2-second cycle. This is an SDR phosphor treatment, not a claim of true HDR output.

Edit `public/kernel.js` for the actual drawing and `public/styles.css` for day/night colors. `scripts/ui-v03-check.mjs` regenerates these bitmap exports from the drawing.
