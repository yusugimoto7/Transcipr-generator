#!/usr/bin/env python3
"""
Fill an official IRCC XFA (Adobe LiveCycle) form by injecting values into the
form's XFA `datasets` packet. IRCC forms (IMM 1294, 5257, 5645, 5476, ...) are
dynamic XFA forms that pure-JS libraries (pdf-lib) cannot read or fill; qpdf via
pikepdf handles them reliably.

Usage:
    python3 fill_form.py <template.pdf> <output.pdf>
    # instructions JSON is read from STDIN:
    # {
    #   "instructions": [
    #     {"som": "form1/Page1/PersonalDetails/Name/FamilyName", "value": "Smith"},
    #     {"som": "form1/Page1/PersonalDetails/Citizenship/Citizenship",
    #      "value": "Iran", "lov": "CountryOfCitizenshipList"}
    #   ]
    # }
    #
    # - `som`  : path under <xfa:data>, segments separated by "/". Existing nodes
    #            are matched by local name (namespaces ignored); missing leaf nodes
    #            are created.
    # - `value`: the text to set (empty/None is skipped).
    # - `lov`  : optional List-Of-Values group name in the form's own LOVFile; the
    #            value is mapped to the matching IRCC code (case-insensitive). If no
    #            match is found the raw value is written and a warning is emitted.

Output: writes the filled PDF to <output.pdf>; prints a JSON summary to STDOUT.
Exit code 0 on success, non-zero on failure.
"""
import sys
import json

try:
    import pikepdf
    from lxml import etree
except Exception as e:  # pragma: no cover - dependency guard
    print(json.dumps({"ok": False, "error": f"missing dependency: {e}"}))
    sys.exit(3)

XFA_NS = "http://www.xfa.org/schema/xfa-data/1.0/"
NS = {"xfa": XFA_NS}


def get_datasets_stream(pdf):
    acro = pdf.Root.get("/AcroForm")
    if acro is None:
        raise RuntimeError("no AcroForm (not an XFA form)")
    xfa = acro.get("/XFA")
    if xfa is None:
        raise RuntimeError("no /XFA array")
    for i in range(0, len(xfa), 2):
        if str(xfa[i]) == "datasets":
            return xfa[i + 1]
    raise RuntimeError("no 'datasets' packet in XFA")


def build_lov_maps(root):
    """Return {ListGroupName: {display_lower: code}} from the LOVFile packet."""
    maps = {}
    lovfile = root.find("LOVFile")
    if lovfile is None:
        return maps
    lov = lovfile.find("LOV")
    if lov is None:
        return maps
    for group in lov:
        if not isinstance(group.tag, str):
            continue
        name = etree.QName(group).localname
        entries = {}
        for item in group:
            if not isinstance(item.tag, str):
                continue
            code = item.get("lic")
            disp = (item.text or "").strip()
            if code and disp:
                entries[disp.lower()] = code
        if entries:
            maps[name] = entries
    return maps


def find_or_create(data_el, som):
    """Navigate/create the node at `som` (slash-separated) under <xfa:data>."""
    segments = [s for s in som.split("/") if s]
    cur = data_el
    for seg in segments:
        nxt = None
        for child in cur:
            if isinstance(child.tag, str) and etree.QName(child).localname == seg:
                nxt = child
                break
        if nxt is None:
            nxt = etree.SubElement(cur, seg)
        cur = nxt
    return cur


def main():
    if len(sys.argv) != 3:
        print(json.dumps({"ok": False, "error": "usage: fill_form.py template.pdf output.pdf"}))
        return 2
    template, output = sys.argv[1], sys.argv[2]
    try:
        payload = json.load(sys.stdin)
    except Exception as e:
        print(json.dumps({"ok": False, "error": f"bad stdin JSON: {e}"}))
        return 2
    instructions = payload.get("instructions", [])

    try:
        pdf = pikepdf.open(template)
        ds = get_datasets_stream(pdf)
        root = etree.fromstring(bytes(ds.read_bytes()))
    except Exception as e:
        print(json.dumps({"ok": False, "error": f"could not open template: {e}"}))
        return 1

    data = root.find("xfa:data", NS)
    if data is None:
        print(json.dumps({"ok": False, "error": "no <xfa:data> in datasets"}))
        return 1

    lov_maps = build_lov_maps(root)
    set_count = 0
    warnings = []

    for ins in instructions:
        som = ins.get("som")
        value = ins.get("value")
        if not som or value is None or str(value).strip() == "":
            continue
        value = str(value)
        lov = ins.get("lov")
        if lov:
            table = lov_maps.get(lov, {})
            code = table.get(value.strip().lower())
            if code is None:
                warnings.append(f"{lov}: no code for '{value}'")
            else:
                value = code
        node = find_or_create(data, som)
        node.text = value
        set_count += 1

    try:
        ds.write(etree.tostring(root, xml_declaration=False))
        pdf.save(output)
    except Exception as e:
        print(json.dumps({"ok": False, "error": f"could not write output: {e}"}))
        return 1

    print(json.dumps({"ok": True, "fieldsSet": set_count, "warnings": warnings}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
