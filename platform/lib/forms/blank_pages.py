#!/usr/bin/env python3
"""
Detect blank pages in a PDF deterministically: rasterize each page at low
resolution with poppler's pdftoppm and measure the fraction of "ink" pixels.
A scanned blank sheet is near-uniform white, so its ink fraction is ~0.

Usage:  python3 blank_pages.py file.pdf
Output: {"ok": true, "pages": N, "blank": [1-based page numbers]}
"""
import sys
import os
import json
import glob
import re
import subprocess
import tempfile

DARK_THRESHOLD = 128   # gray value below which a pixel counts as ink
MIN_INK_FRACTION = 0.002  # pages with less ink than this are blank


def page_ink_fraction(path):
    with open(path, "rb") as f:
        data = f.read()
    if not data.startswith(b"P5"):
        return None
    # Parse PGM header: P5 <width> <height> <maxval>, allowing comments.
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
    i += 1  # single whitespace after maxval
    if len(vals) < 3:
        return None
    w, h, _maxv = vals
    px = data[i : i + w * h]
    if not px:
        return None
    dark = sum(1 for b in px if b < DARK_THRESHOLD)
    return dark / len(px)


def main():
    if len(sys.argv) != 2:
        print(json.dumps({"ok": False, "error": "usage: blank_pages.py file.pdf"}))
        return 2
    pdf = sys.argv[1]
    with tempfile.TemporaryDirectory() as td:
        prefix = os.path.join(td, "p")
        try:
            subprocess.run(
                ["pdftoppm", "-gray", "-r", "25", pdf, prefix],
                check=True,
                timeout=180,
                capture_output=True,
            )
        except FileNotFoundError:
            print(json.dumps({"ok": False, "error": "pdftoppm not installed"}))
            return 1
        except Exception as e:
            print(json.dumps({"ok": False, "error": str(e)}))
            return 1

        files = glob.glob(prefix + "-*.pgm")

        def page_no(fp):
            m = re.search(r"-(\d+)\.pgm$", fp)
            return int(m.group(1)) if m else 0

        files.sort(key=page_no)
        blank = []
        for fp in files:
            frac = page_ink_fraction(fp)
            if frac is not None and frac < MIN_INK_FRACTION:
                blank.append(page_no(fp))
        print(json.dumps({"ok": True, "pages": len(files), "blank": blank}))
        return 0


if __name__ == "__main__":
    sys.exit(main())
