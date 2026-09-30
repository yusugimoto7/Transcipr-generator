#!/usr/bin/env python3
"""
Describe every field of an IRCC XFA form, for authoring field maps:

    python3 inspect_form.py form.pdf            # one line per field
    python3 inspect_form.py form.pdf --json     # full JSON

Each field's data path (as fill_form.py addresses it), its kind (text, date,
check, choice, radio), the values a check box or radio button stores when
ticked (IRCC uses 1/0, Y/N or true/false), the drop-down's value list and the
caption printed next to it. Structure only, never values.
"""
import json
import os
import sys

import pikepdf

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from xfa_fields import form_fields  # noqa: E402


def main(path, as_json=False):
    fields = form_fields(pikepdf.open(path))
    if as_json:
        print(json.dumps(fields, ensure_ascii=False, indent=1))
        return
    for f in fields:
        extra = ""
        if f["kind"] == "radio":
            extra = " ".join(f"{o['name']}={o['on']}" for o in f["options"])
        elif f["kind"] == "check":
            extra = f"on={f['on']} off={f['off']}"
        elif f.get("lov"):
            extra = f"lov={f['lov']}"
        elif f.get("items"):
            extra = "items=" + ",".join(f"{i['value']}:{i['text']}" for i in f["items"][:8])
        print(f"{f['kind']:6} {f['path']}  {extra}  | {f['caption'][:70]}")


if __name__ == "__main__":
    main(sys.argv[1], "--json" in sys.argv)
