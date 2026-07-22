#!/usr/bin/env python3
"""
Dump the XFA leaf-field paths (SOM) of an IRCC form PDF, so field maps can be
authored against the real form. Reads a PDF path as argv[1], prints JSON:
  { "ok": true, "paths": ["form1/Page1/PersonalDetails/Name/FamilyName", ...] }
Only structural paths are emitted — no field values — so this is safe to run on
any form (blank or filled).
"""
import sys
import json

try:
    import pikepdf
    from lxml import etree
except Exception as e:  # pragma: no cover
    print(json.dumps({"ok": False, "error": f"missing dependency: {e}"}))
    sys.exit(3)

NS = {"xfa": "http://www.xfa.org/schema/xfa-data/1.0/"}


def main():
    if len(sys.argv) != 2:
        print(json.dumps({"ok": False, "error": "usage: dump_schema.py form.pdf"}))
        return 2
    try:
        pdf = pikepdf.open(sys.argv[1])
        xfa = pdf.Root.AcroForm.XFA
        idx = {str(xfa[i]): i + 1 for i in range(0, len(xfa), 2)}
        root = etree.fromstring(bytes(xfa[idx["datasets"]].read_bytes()))
    except Exception as e:
        print(json.dumps({"ok": False, "error": f"could not read XFA: {e}"}))
        return 1

    data = root.find("xfa:data", NS)
    if data is None:
        print(json.dumps({"ok": False, "error": "no <xfa:data>"}))
        return 1

    paths = []

    def walk(el, path):
        kids = [c for c in el if isinstance(c.tag, str)]
        if not kids:
            paths.append(path)
            return
        for c in kids:
            walk(c, path + "/" + etree.QName(c).localname)

    for top in data:
        if isinstance(top.tag, str):
            walk(top, etree.QName(top).localname)

    # de-dupe while preserving order
    seen = set()
    uniq = [p for p in paths if not (p in seen or seen.add(p))]
    print(json.dumps({"ok": True, "count": len(uniq), "paths": uniq}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
