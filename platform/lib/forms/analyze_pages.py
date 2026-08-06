#!/usr/bin/env python3
"""
Analyze the pages of a PDF for package compilation.

  * blank pages - rasterize cheaply and measure ink coverage. A scanned blank
                  sheet is near-uniform white (~0% ink).
  * thumbnails  - optionally render small PNGs of the non-blank pages so the
                  caller can check orientation with a vision model. (Tesseract's
                  OSD is unreliable for Persian/Arabic scans, so orientation is
                  decided by the caller, not here.)

NOTE: pdftoppm applies each page's /Rotate flag when rendering, so a thumbnail
already reflects that flag. Any rotation derived from a thumbnail is therefore
ADDITIONAL to the page's own /Rotate.

Usage:  python3 analyze_pages.py file.pdf [thumb_dir]
Output: {"ok": true, "pages": N, "blank": [...], "thumbs": {"<page>": "path"}}
"""
import sys
import os
import json
import glob
import re
import subprocess
import tempfile

DARK_THRESHOLD = 128       # gray value below which a pixel counts as ink
MIN_INK_FRACTION = 0.002   # pages with less ink than this are blank
INK_DPI = 25               # cheap raster, plenty for blank detection
THUMB_WIDTH = 520          # px wide, enough for a vision model to read layout


def page_ink_fraction(path):
    """Fraction of dark pixels in a binary PGM (P5) file, or None."""
    with open(path, "rb") as f:
        data = f.read()
    if not data.startswith(b"P5"):
        return None
    vals = []
    i = 2
    while len(vals) < 3 and i < len(data):
        while i < len(data) and data[i : i + 1].isspace():
            i += 1
        if data[i : i + 1] == b"#":
            while i < len(data) and data[i] != 0x0A:
                i += 1
            continue
        j = i
        while j < len(data) and not data[j : j + 1].isspace():
            j += 1
        try:
            vals.append(int(data[i:j]))
        except ValueError:
            return None
        i = j
    i += 1
    if len(vals) < 3:
        return None
    w, h, _maxv = vals
    px = data[i : i + w * h]
    if not px:
        return None
    dark = sum(1 for b in px if b < DARK_THRESHOLD)
    return dark / len(px)


def page_no(fp):
    m = re.search(r"-(\d+)\.(pgm|png)$", fp)
    return int(m.group(1)) if m else 0


def main():
    if len(sys.argv) not in (2, 3):
        print(json.dumps({"ok": False, "error": "usage: analyze_pages.py file.pdf [thumb_dir]"}))
        return 2
    pdf = sys.argv[1]
    thumb_dir = sys.argv[2] if len(sys.argv) == 3 else None

    with tempfile.TemporaryDirectory() as td:
        prefix = os.path.join(td, "p")
        try:
            subprocess.run(
                ["pdftoppm", "-gray", "-r", str(INK_DPI), pdf, prefix],
                check=True, timeout=600, capture_output=True,
            )
        except FileNotFoundError:
            print(json.dumps({"ok": False, "error": "pdftoppm not installed"}))
            return 1
        except Exception as e:
            print(json.dumps({"ok": False, "error": str(e)}))
            return 1

        files = sorted(glob.glob(prefix + "-*.pgm"), key=page_no)
        blank = []
        for fp in files:
            frac = page_ink_fraction(fp)
            if frac is not None and frac < MIN_INK_FRACTION:
                blank.append(page_no(fp))

        thumbs = {}
        if thumb_dir:
            os.makedirs(thumb_dir, exist_ok=True)
            tprefix = os.path.join(thumb_dir, "t")
            try:
                subprocess.run(
                    ["pdftoppm", "-png", "-scale-to-x", str(THUMB_WIDTH), "-scale-to-y", "-1",
                     pdf, tprefix],
                    check=True, timeout=900, capture_output=True,
                )
                blank_set = set(blank)
                for fp in sorted(glob.glob(tprefix + "-*.png"), key=page_no):
                    n = page_no(fp)
                    if n in blank_set:
                        os.remove(fp)
                        continue
                    thumbs[str(n)] = fp
            except Exception:
                thumbs = {}

        print(json.dumps({"ok": True, "pages": len(files), "blank": blank, "thumbs": thumbs}))
        return 0


if __name__ == "__main__":
    sys.exit(main())
