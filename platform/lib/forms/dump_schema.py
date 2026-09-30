#!/usr/bin/env python3
"""
Dump the fillable fields of an IRCC XFA form PDF, so field maps can be
authored (and matched) against the real form. Reads a PDF path as argv[1],
prints JSON:
  { "ok": true, "paths": ["form1/Page1/PersonalDetails/Name/FamilyName", ...],
    "fields": [{"path", "kind", "caption", "lov"?, "options"?, "on"?, "off"?}, ...] }
Paths are the data paths the filler writes to (see xfa_fields.py). Only
structure is emitted — no field values — so this is safe on any form.
"""
import json
import os
import sys

try:
    import pikepdf
except Exception as e:  # pragma: no cover
    print(json.dumps({"ok": False, "error": f"missing dependency: {e}"}))
    sys.exit(3)

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from xfa_fields import form_fields  # noqa: E402


def main():
    if len(sys.argv) != 2:
        print(json.dumps({"ok": False, "error": "usage: dump_schema.py form.pdf"}))
        return 2
    try:
        fields = form_fields(pikepdf.open(sys.argv[1]))
    except Exception as e:
        print(json.dumps({"ok": False, "error": f"could not read XFA: {e}"}))
        return 1
    print(json.dumps({"ok": True, "count": len(fields), "paths": [f["path"] for f in fields], "fields": fields}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
