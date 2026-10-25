# Kling source pixel study

Two bounded offline candidates process the approved Kling anatomy and complete native schedules. They are not redrawn characters. The primary samples are male BASE run (16 ticks / 16 drawings at24fps) and female BASE walk (27 ticks / 25 drawings at 24 fps, preserving held source 28 and 41). Original full idle clips and male walk are auxiliary packaging context. No default catalog or previous asset is changed.

- **detail-128:** fixed padded 704x1064 canvas to 176x266 via premultiplied-alpha 4x4 BOX, shared 128-color palette.
- **compact-64:** fixed padded 704x1064 to 88x133 via premultiplied-alpha 8x8 BOX, shared 64-color palette, exact nearest 2x expansion to 176x266.

Every 704x1056 source frame receives the same transparent padding: top 2, bottom 6, left/right 0 pixels. No original pixels are cropped. Body mapping is (x/4,(y+2)/4), preserving the exact aspect ratio and mapping source anchor (352,998) to integer (88,250) without rounding, shifting individual poses, or distorting either grid. The original content extent 176x264 sits within 176x266. BOX works in encoded sRGB using integer sums and round-half-up; all projected alpha levels remain intact. Each palette is learned once from the entire scoped timeline bank across both characters (source holds weighted by their duration), then assigned by exact nearest RGB distance without dithering. There is no per-frame crop-fit, head locking, temporal interpolation, new shadow removal, or AI regeneration.

`study.json` records parameters, tool versions, input SHA256, source IDs/cells, native animations and summary checks. `palettes/*.json` records every palette RGB entry and the deterministic training-pool hash. `variants/<variant>/<character>/atlas.json` maps source IDs to transparent PNG atlas cells and records per-frame alpha/silhouette diagnostics. Alpha is byte-identical to each candidate's unquantized fixed projection; the separate comparison against the quarter projection exposes coarse-grid silhouette loss.

Contact sheets show every primary timeline tick at native 1x and nearest 2x. Comparison sheets show four phases against the unquantized quarter projection. The reference projection is diagnostic, not a third candidate. GIFs are explicitly labeled **AUTHORING PREVIEW / NOT APP CAPTURE**, composited over checkerboard, and use centisecond-rounded timing because GIF cannot represent exact 24 fps. The atlas metadata retains the exact 24 fps schedule and is authoritative for app packaging and alpha. Source blur, original pose changes and existing holds remain; palette consistency cannot repair source motion.

Regenerate from the repository root:

```sh
/tmp/kling-polish-venv/bin/python scripts/prepare-kling-source-pixel-study.py
```

Use `--output /tmp/kling-source-pixel-recheck` for an isolated deterministic rerun. Python/Pillow/NumPy versions are recorded in `study.json`.
