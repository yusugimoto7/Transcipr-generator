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
for t in pdftoppm pdftotext tesseract; do command -v "$t" >/dev/null || echo "warning: $t is missing (page pictures / orientation)"; done
npx next build >/tmp/replay-build.log 2>&1 || { tail -40 /tmp/replay-build.log; exit 1; }
echo "Ready. Use: export PYTHON_BIN=/tmp/pv/bin/python"
