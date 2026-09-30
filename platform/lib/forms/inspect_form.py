#!/usr/bin/env python3
"""
Describe every field of an IRCC XFA form, for authoring field maps:

    python3 inspect_form.py form.pdf > fields.json

For each field: its data path (as fill_form.py addresses it), its kind
(text, date, check, choice, radio group), the values a checkbox or radio
button stores when ticked (IRCC uses 1/0, Y/N or custom values — the source
of "ticks not showing"), the drop-down's list of values (LOV group) and the
caption printed next to it. Structure only, never values.
"""
import json
import sys

import pikepdf
from lxml import etree

TPL = "{http://www.xfa.org/schema/xfa-template/3.3/}"


def local(el):
    return etree.QName(el).localname


def text_of(el):
    return " ".join(" ".join(el.itertext()).split()) if el is not None else ""


def caption(field):
    for c in field:
        if isinstance(c.tag, str) and local(c) == "caption":
            return text_of(c)[:120]
    for c in field:
        if isinstance(c.tag, str) and local(c) == "assist":
            return text_of(c)[:120]
    return ""


def ui_kind(field):
    for c in field:
        if isinstance(c.tag, str) and local(c) == "ui":
            for u in c:
                if isinstance(u.tag, str):
                    return local(u)
    return "?"


def items(field):
    out = []
    for c in field:
        if isinstance(c.tag, str) and local(c) == "items":
            out.append({"save": c.get("save") == "1", "values": [text_of(i) for i in c if isinstance(i.tag, str)]})
    return out


def binding(field):
    for c in field:
        if isinstance(c.tag, str) and local(c) == "bind":
            return c.get("match"), c.get("ref")
    return None, None


def main(path):
    pdf = pikepdf.open(path)
    xfa = pdf.Root.AcroForm.XFA
    parts = {str(xfa[i]): xfa[i + 1] for i in range(0, len(xfa), 2)}
    tpl = etree.fromstring(bytes(parts["template"].read_bytes()))
    fields = []

    def walk(el, trail):
        for c in el:
            if not isinstance(c.tag, str):
                continue
            kind = local(c)
            name = c.get("name")
            match, ref = binding(c)
            if kind in ("subform", "area", "subformSet"):
                walk(c, trail + ([name] if name and match != "none" else []))
            elif kind == "exclGroup":
                opts = []
                for f in c:
                    if isinstance(f.tag, str) and local(f) == "field":
                        its = items(f)
                        opts.append({"name": f.get("name"), "on": its[0]["values"][0] if its and its[0]["values"] else None, "caption": caption(f)})
                fields.append({"path": "/".join(trail + [name or "?"]), "kind": "radio", "options": opts, "caption": caption(c)})
            elif kind == "field":
                if match == "none":
                    continue
                p = "/".join(trail + [name or "?"])
                if ref:
                    p += f"  (bind {ref})"
                entry = {"path": p, "kind": ui_kind(c), "caption": caption(c)}
                its = items(c)
                if entry["kind"] == "checkButton" and its:
                    entry["on"], entry["off"] = (its[0]["values"] + [None, None])[:2]
                elif its:
                    entry["items"] = its[-1]["values"][:12]
                    entry["itemCount"] = len(its[-1]["values"])
                fields.append(entry)

    root = tpl.find(f"{TPL}subform") or next(e for e in tpl.iter() if isinstance(e.tag, str) and local(e) == "subform")
    walk(root, [root.get("name")])
    print(json.dumps(fields, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main(sys.argv[1])
