#!/usr/bin/env python3
"""
Read a filled IRCC XFA form back, box by box, the way Adobe merges it:
every field of the form (path, kind, caption) with the value its data node
holds, drop-down codes turned back into their text, plus the extra table rows
and any node still marked empty (xsi:nil) although it has a value.

    python3 audit_form.py filled.pdf  ->  JSON on stdout
"""
import json
import os
import re
import sys

import pikepdf
from lxml import etree

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "lib", "forms"))
from xfa_fields import form_fields  # noqa: E402
from fill_form import build_lov_maps, get_datasets_stream, local, seg_parts  # noqa: E402

XSI_NIL = "{http://www.w3.org/2001/XMLSchema-instance}nil"


def find(data_el, path):
    cur = data_el
    for seg in [s for s in path.split("/") if s]:
        name, idx = seg_parts(seg)
        same = [c for c in cur if isinstance(c.tag, str) and local(c) == name]
        if len(same) <= idx:
            return None
        cur = same[idx]
    return cur


def main(pdf_path):
    pdf = pikepdf.open(pdf_path)
    root = etree.fromstring(bytes(get_datasets_stream(pdf).read_bytes()))
    data = next(e for e in root if isinstance(e.tag, str) and local(e) == "data")
    lov = build_lov_maps(root)
    out = []
    for f in form_fields(pdf):
        node = find(data, f["path"])
        raw = (node.text or "").strip() if node is not None else ""
        shown = raw
        if raw and f.get("kind") == "choice":
            entries = lov.get(f.get("lov") or "", []) or [(i.get("value"), i.get("text")) for i in f.get("items") or []]
            shown = next((d for c, d in entries if c == raw), raw)
        if raw and f.get("kind") == "radio":
            for o in f.get("options") or []:
                if o.get("on") == raw:
                    shown = f"{o.get('name') or o.get('caption') or raw}"
        out.append({
            "path": f["path"],
            "kind": f.get("kind"),
            "caption": re.sub(r"\s+", " ", f.get("caption") or "")[:140],
            "value": raw,
            "shown": shown,
            "nil": bool(node is not None and node.get(XSI_NIL) == "true"),
        })
    # Extra instances of repeating rows ([1], [2] …) that hold something.
    rows = []
    def walk(el, prefix):
        counts = {}
        for c in el:
            if not isinstance(c.tag, str):
                continue
            n = local(c)
            i = counts.get(n, 0)
            counts[n] = i + 1
            p = f"{prefix}/{n}[{i}]" if i else f"{prefix}/{n}"
            if len(c):
                walk(c, p)
            elif i or re.search(r"\[\d+\]", p):
                if (c.text or "").strip():
                    rows.append({"path": p.lstrip("/"), "value": c.text.strip()})
    for top in data:
        if isinstance(top.tag, str) and local(top) not in ("LOVFile",):
            walk(top, local(top))
    print(json.dumps({"fields": out, "rows": rows}, ensure_ascii=False))


if __name__ == "__main__":
    main(sys.argv[1])
