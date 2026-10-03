#!/usr/bin/env bash
# Prepares a fresh cloud machine for the nightly replay (test/replay/README.md):
# Node packages, the Python form tools, a production build of the platform.
#   bash platform/scripts/replay-setup.sh && export PYTHON_BIN=/tmp/pv/bin/python
set -euo pipefail
cd "$(dirname "$0")/.."
[ -d node_modules ] || npm ci --no-audit --no-fund
if ! /tmp/pv/bin/python -c 'import pikepdf, lxml, PIL' 2>/dev/null; then
  python3 -m venv /tmp/pv
  /tmp/pv/bin/pip install -q pikepdf lxml pillow
fi
# OCR (with Persian) is needed by the document checks and the orientation fix; npm test fails without it.
if ! tesseract --list-langs 2>/dev/null | grep -qx fas && command -v apt-get >/dev/null; then
  (apt-get install -y -q tesseract-ocr tesseract-ocr-fas >/dev/null 2>&1 || { apt-get update -q >/dev/null 2>&1 && apt-get install -y -q tesseract-ocr tesseract-ocr-fas >/dev/null 2>&1; }) || true
fi
for t in pdftoppm pdftotext tesseract; do command -v "$t" >/dev/null || echo "warning: $t is missing (page pictures / orientation)"; done
npx next build >/tmp/replay-build.log 2>&1 || { tail -40 /tmp/replay-build.log; exit 1; }
echo "Ready. Use: export PYTHON_BIN=/tmp/pv/bin/python"
