#!/usr/bin/env python3
"""
Fill an official IRCC XFA (Adobe LiveCycle) form by injecting values into the
form's XFA `datasets` packet. IRCC forms (IMM 1294, 1295, 5257, 5645, 5476, ...)
are dynamic XFA forms that pure-JS libraries (pdf-lib) cannot read or fill;
qpdf via pikepdf handles them reliably.

Usage:
    python3 fill_form.py <template.pdf> <output.pdf>
    # instructions JSON is read from STDIN:
    # {
    #   "instructions": [
    #     {"som": "form1/Page1/PersonalDetails/Name/FamilyName", "value": "Smith"},
    #     {"som": "form1/Page1/PersonalDetails/Citizenship/Citizenship", "value": "Iran"},
    #     {"som": "form1/Page4/BackgroundInfo/Choice[1]", "value": "N"},
    #     {"som": "IMM_5645/page1/SectionA/Mother/MotherName", "value": "...", "native": true}
    #   ]
    # }
    #
    # - `som`   : data path under <xfa:data> as resolved by xfa_fields.py
    #             ("Name[2]" = the third node of that name). A path that is not
    #             a field of this form is skipped with a warning.
    # - `value` : the answer. It is converted to what the field stores:
    #             drop-downs -> the form's own code (from its value list, by code,
    #             display text or country / language name); Yes/No radio groups
    #             -> the form's Y/N or true/false; check boxes -> 1/0; dates ->
    #             YYYY-MM-DD. A value that cannot be converted is skipped.
    # - `native`: the field may hold a name in its native script (IMM 5645
    #             names). Every other text field takes English (Latin script)
    #             only; anything else is skipped with a warning, never written.
    # - `lov`   : value list for a drop-down the form fills by script, e.g.
    #             "CityList.BC" (Canadian cities of one province).
    # - `label` : optional name for warnings (defaults to the form's caption).

Output: writes the filled PDF to <output.pdf>; prints a JSON summary to STDOUT:
    {"ok": true, "fieldsSet": N, "warnings": [{"path", "label", "reason"}]}
Exit code 0 on success, non-zero on failure.
"""
import json
import os
import re
import sys
import unicodedata

try:
    import pikepdf
    from lxml import etree
except Exception as e:  # pragma: no cover - dependency guard
    print(json.dumps({"ok": False, "error": f"missing dependency: {e}"}))
    sys.exit(3)

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from xfa_fields import form_fields  # noqa: E402

XFA_NS = "http://www.xfa.org/schema/xfa-data/1.0/"
NS = {"xfa": XFA_NS}
XSI_NIL = "{http://www.w3.org/2001/XMLSchema-instance}nil"

YES = {"y", "yes", "true", "1", "on", "x"}
NO = {"n", "no", "false", "0", "off"}

# Words people write for an entry whose IRCC text differs.
ALIASES = {
    "never married / single": "single",
    "never married/single": "single",
    "never married": "single",
    "common law": "common-law",
    "another gender": "another gender",
    "usa": "united states of america",
    "us": "united states of america",
    "u.s.a.": "united states of america",
    "united states": "united states of america",
    "uk": "united kingdom",
    "uae": "united arab emirates",
    "south korea": "korea, south",
    "north korea": "korea, north (dprk)",
    "türkiye": "turkey",
    "turkiye": "turkey",
}

PERSIAN_DIGITS = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")


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


def local(el):
    return etree.QName(el).localname


def build_lov_maps(root):
    """{ListGroupName: [(code, display)]} from the form's LOVFile packet."""
    maps = {}
    lov = next((e for e in root.iter() if isinstance(e.tag, str) and local(e) == "LOV"), None)
    if lov is None:
        return maps
    for group in lov:
        if not isinstance(group.tag, str):
            continue
        entries = []
        for item in group:
            if not isinstance(item.tag, str):
                continue
            code, disp = item.get("lic"), (item.text or "").strip()
            if code is not None and disp:
                entries.append((code, disp))
            elif len(item):  # nested list: CityList/BC/City -> "CityList.BC"
                sub = [(c.get("lic"), (c.text or "").strip()) for c in item if isinstance(c.tag, str)]
                maps[f"{local(group)}.{local(item)}"] = [(c, d) for c, d in sub if c is not None and d]
        maps[local(group)] = entries
    return maps


def norm(s):
    s = re.sub(r"[\u2010-\u2015\u2212]", "-", str(s))
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    s = s.replace("’", "'")
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9,()'/ -]", " ", s)).strip()


def variants(display):
    """Ways an IRCC list entry can be named: 'F Female', 'IRN (Iran)'."""
    d = norm(display)
    out = {d}
    m = re.match(r"^([a-z]{1,3}) (.+)$", d)  # "f female", "x another gender"
    if m:
        out.add(m.group(2))
    m = re.match(r"^(.*?)\s*\((.+)\)$", d)  # "irn (iran)"
    if m:
        out.update({m.group(1).strip(), m.group(2).strip()})
    return out


def match_entry(value, entries):
    """The code for `value` in [(code, display)], or None."""
    raw = str(value).strip()
    for code, _ in entries:
        if code and raw == code:
            return code
    v = norm(raw)
    v = ALIASES.get(v, v)
    for code, disp in entries:
        if v in variants(disp):
            return code
    starts = [code for code, disp in entries if any(x.startswith(v) for x in variants(disp))]
    if len(starts) == 1 and len(v) >= 4:
        return starts[0]
    # A finer answer than the list offers ("Married-physically present" on a
    # list that only has "Married").
    if "-" in v:
        return match_entry(v.split("-")[0].strip(), entries)
    return None


def non_latin(text):
    """Letters that are not Latin script (Persian, Arabic, Cyrillic, ...)."""
    bad = []
    for ch in text:
        if unicodedata.category(ch).startswith("L") and "LATIN" not in unicodedata.name(ch, ""):
            bad.append(ch)
    return bad


def is_yes(v):
    return str(v).strip().lower() in YES


def is_no(v):
    return str(v).strip().lower() in NO


def convert(field, value, native, lov_maps, lov=None):
    """(stored value, None) or (None, reason). `lov` names the value list of
    a drop-down the form fills by script (e.g. "CityList.BC")."""
    kind = field["kind"]
    raw = str(value).strip().translate(PERSIAN_DIGITS)

    if kind == "radio":
        opts = field.get("options") or []
        for o in opts:
            if o.get("on") is not None and raw == o["on"]:
                return raw, None
        want = "yes" if is_yes(raw) else "no" if is_no(raw) else None
        if want:
            for o in opts:
                label = f"{o.get('name', '')} {o.get('caption', '')}".strip().lower()
                if label.startswith(want):
                    return o["on"], None
            ons = {str(o.get("on")).lower(): o["on"] for o in opts}
            for cand in (("y", "true", "1") if want == "yes" else ("n", "false", "0")):
                if cand in ons:
                    return ons[cand], None
        return None, "not a Yes/No answer"

    if kind == "check":
        if is_yes(raw) or raw == field.get("on"):
            return field.get("on") or "1", None
        if is_no(raw) or raw == field.get("off"):
            return field.get("off") or "0", None
        return None, "not a tick value"

    if kind == "date":
        m = re.match(r"^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$", raw)
        if not m:
            return None, "not a full date (YYYY-MM-DD)"
        return f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}", None

    if kind == "choice":
        if field.get("lov"):
            entries = lov_maps.get(field["lov"], [])
            code = match_entry(raw, entries)
            return (code, None) if code is not None else (None, f"“{raw[:40]}” is not in the form's list")
        items = field.get("items") or []
        if items:
            code = match_entry(raw, [(i["value"], i["text"]) for i in items])
            return (code, None) if code is not None else (None, f"“{raw[:40]}” is not in the form's list")
        if lov:
            code = match_entry(raw, lov_maps.get(lov, []))
            return (code, None) if code is not None else (None, f"“{raw[:40]}” is not in the form's list")
        # A list filled by the form's own script with no list given: English text only.

    bad = non_latin(raw)
    if bad and not native:
        return None, "not in English — IRCC forms take English (Latin letters) only"
    return raw, None


def seg_parts(seg):
    m = re.match(r"^(.+?)\[(\d+)\]$", seg)
    return (m.group(1), int(m.group(2))) if m else (seg, 0)


def find_or_create(data_el, som):
    """Navigate/create the node at `som` under <xfa:data>; "Name[n]" = n-th of that name."""
    cur = data_el
    for seg in [s for s in som.split("/") if s]:
        name, idx = seg_parts(seg)
        same = [c for c in cur if isinstance(c.tag, str) and local(c) == name]
        while len(same) <= idx:
            new = etree.Element(name)
            if same:
                same[-1].addnext(new)
            else:
                cur.append(new)
            same.append(new)
        cur = same[idx]
    return cur


def canonical(path):
    """'A/B[0]/C' and 'A/B/C' are the same node."""
    return "/".join(re.sub(r"\[0\]$", "", s) for s in path.split("/") if s)


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
        fields = {canonical(f["path"]): f for f in form_fields(pdf)}
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
    filled = set()

    for ins in instructions:
        som = ins.get("som")
        value = ins.get("value")
        if not som or value is None or str(value).strip() == "":
            continue
        field = fields.get(canonical(som))
        label = ins.get("label") or (field or {}).get("caption") or som.split("/")[-1]
        if field is None:
            warnings.append({"path": som, "label": label, "reason": "not a field on this form version"})
            continue
        stored, reason = convert(field, value, bool(ins.get("native")), lov_maps, ins.get("lov"))
        if reason:
            warnings.append({"path": som, "label": label, "reason": reason})
            continue
        # The data path is the first segment (the form's root data group) onwards.
        node = find_or_create(data, som)
        node.text = stored
        # The blank form marks unanswered nodes xsi:nil="true"; Adobe keeps
        # such a node empty (no tick, no text) whatever it holds.
        node.attrib.pop(XSI_NIL, None)
        set_count += 1
        filled.add(canonical(som))

    # A later answer for the same field wins; its earlier warning is moot.
    warnings = [w for w in warnings if canonical(w["path"]) not in filled]

    try:
        ds.write(etree.tostring(root, xml_declaration=False))
        pdf.save(output)
    except Exception as e:
        print(json.dumps({"ok": False, "error": f"could not write output: {e}"}))
        return 1

    print(json.dumps({"ok": True, "fieldsSet": set_count, "warnings": warnings}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
