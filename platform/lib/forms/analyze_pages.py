#!/usr/bin/env python3
"""
Analyze the pages of a PDF for package compilation:

  * blank pages    - rasterize each page and measure ink coverage. A scanned
                     blank sheet is near-uniform white (~0% ink).
  * orientation    - use Tesseract's OSD (orientation & script detection) to
                     find pages whose CONTENT is rotated (e.g. a page photo-
                     graphed upside down carries no /Rotate flag, so metadata
                     alone cannot detect it).

Usage:  python3 analyze_pages.py file.pdf
Output: {"ok": true, "pages": N,
         "blank": [1-based page numbers],
         "rotate": {"<1-based page>": 90|180|270}}   # clockwise degrees to fix

Everything is best-effort: missing tools or unreadable pages yield empty
results rather than errors, so the caller keeps all pages unchanged.
"""
import sys
import os
import json
import glob
import re
import subprocess
import tempfile

DARK_THRESHOLD = 128      # gray value below which a pixel counts as ink
MIN_INK_FRACTION = 0.002  # pages with less ink than this are blank
RENDER_DPI = 120          # enough for Tesseract OSD, still fast
MIN_OSD_CONFIDENCE = 1.0  # ignore low-confidence orientation guesses


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


def detect_rotation(path):
    """Clockwise degrees needed to make the page upright, per Tesseract OSD."""
    try:
        out = subprocess.run(
            ["tesseract", path, "-", "--psm", "0"],
            capture_output=True,
            timeout=60,
            text=True,
        )
    except Exception:
        return 0
    text = (out.stdout or "") + (out.stderr or "")
    m = re.search(r"Rotate:\s*(\d+)", text)
    if not m:
        return 0
    conf = re.search(r"Orientation confidence:\s*([\d.]+)", text)
    if conf:
        try:
            if float(conf.group(1)) < MIN_OSD_CONFIDENCE:
                return 0
        except ValueError:
            pass
    deg = int(m.group(1)) % 360
    return deg if deg in (90, 180, 270) else 0


def main():
    if len(sys.argv) != 2:
        print(json.dumps({"ok": False, "error": "usage: analyze_pages.py file.pdf"}))
        return 2
    pdf = sys.argv[1]
    detect_orientation = os.environ.get("DETECT_ORIENTATION", "1") != "0"

    with tempfile.TemporaryDirectory() as td:
        prefix = os.path.join(td, "p")
        try:
            subprocess.run(
                ["pdftoppm", "-gray", "-r", str(RENDER_DPI), pdf, prefix],
                check=True,
                timeout=600,
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
        rotate = {}
        for fp in files:
            n = page_no(fp)
            frac = page_ink_fraction(fp)
            if frac is not None and frac < MIN_INK_FRACTION:
                blank.append(n)
                continue  # no need to check orientation of a blank page
            if detect_orientation:
                deg = detect_rotation(fp)
                if deg:
                    rotate[str(n)] = deg
        print(json.dumps({"ok": True, "pages": len(files), "blank": blank, "rotate": rotate}))
        return 0


if __name__ == "__main__":
    sys.exit(main())
