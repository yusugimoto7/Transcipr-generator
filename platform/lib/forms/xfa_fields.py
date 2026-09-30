"""
Resolve every fillable field of an IRCC XFA form to the data node it is bound
to, the way Adobe Reader merges data into the template:

  - a named subform with normal binding opens a data group of that name;
    subforms with no name or `<bind match="none">` are transparent;
  - `<bind match="dataRef" ref="$.A.B">` binds relative to the current data
    group (`$record.` from the root); a repeating row bound to `...X[*]` gets
    one data group per instance (X[0], X[1], ...);
  - two fields of the same name under the same data group bind to the 1st, 2nd
    ... data node of that name (IRCC's "Choice" radio groups), written "Choice[1]".

Paths are slash-separated under <xfa:data>, e.g.
  form1/Page4/BackgroundInfo/Choice[1]
  Schedule1/MilitaryServiceInfo/MilitaryServiceDetails/MilitaryServiceDetail[2]/From/Year

For each field: kind (text, date, check, choice, radio, number, other), the
values a check box / radio button stores, the drop-down's value list (the
form's own LOV group, or its inline items) and its caption. Structure only —
never a value.
"""
import re

from lxml import etree


def local(el):
    return etree.QName(el).localname


def kids(el, name=None):
    return [c for c in el if isinstance(c.tag, str) and (name is None or local(c) == name)]


def kid(el, name):
    for c in el:
        if isinstance(c.tag, str) and local(c) == name:
            return c
    return None


def text_of(el):
    return " ".join(" ".join(el.itertext()).split()) if el is not None else ""


def caption(node):
    for tag in ("caption", "assist"):
        c = kid(node, tag)
        if c is not None:
            t = text_of(c)
            if t:
                return t[:200]
    return ""


def ui_kind(field):
    ui = kid(field, "ui")
    if ui is None:
        return "text"
    for u in kids(ui):
        k = local(u)
        if k == "picture":
            continue
        return {
            "textEdit": "text",
            "dateTimeEdit": "date",
            "checkButton": "check",
            "choiceList": "choice",
            "numericEdit": "number",
        }.get(k, "other")
    return "text"


def item_lists(field):
    """[(display values), (saved values)] of inline <items>."""
    lists = kids(field, "items")
    disp = [text_of(i) for i in kids(lists[0])] if lists else []
    save = disp
    for lst in lists:
        if lst.get("save") == "1":
            save = [text_of(i) for i in kids(lst)]
        elif lst is not lists[0]:
            pass
    return disp, save


def bound_lov(field):
    b = kid(field, "bindItems")
    if b is None:
        return None
    m = re.search(r"LOV\.(\w+)", b.get("ref") or "")
    return m.group(1) if m else None


def split_ref(ref):
    """'$.A.B[*]' -> (from_root, ['A', 'B[*]'])."""
    ref = ref.strip()
    root = False
    if ref.startswith("$record."):
        root, ref = True, ref[len("$record."):]
    elif ref.startswith("$."):
        ref = ref[2:]
    elif ref.startswith("$data."):
        root, ref = True, ref[len("$data."):]
        ref = ref.split(".", 1)[1] if "." in ref else ""
    elif ref == "$":
        ref = ""
    return root, [s for s in ref.split(".") if s]


class Resolver:
    def __init__(self, template_root):
        self.tpl = template_root
        self.fields = []
        self._counts = {}  # (context path, name) -> next index

    def _seg(self, ctx, name, index=None):
        if index is None:
            key = (ctx, name)
            index = self._counts.get(key, 0)
            self._counts[key] = index + 1
        return f"{ctx}/{name}" + (f"[{index}]" if index else "") if ctx else name + (f"[{index}]" if index else "")

    def _ref_ctx(self, ctx, root_ctx, ref, instance=0):
        from_root, segs = split_ref(ref)
        base = root_ctx if from_root else ctx
        for s in segs:
            m = re.match(r"^(\w+)\[(\*|\d+)\]$", s)
            if m:
                i = instance if m.group(2) == "*" else int(m.group(2))
                base = f"{base}/{m.group(1)}" + (f"[{i}]" if i else "")
            else:
                base = f"{base}/{s}" if base else s
        return base

    def run(self):
        top = kid(self.tpl, "subform")
        if top is None:
            return []
        name = top.get("name") or "form1"
        self._walk(top, name, name)
        return self.fields

    def _walk(self, el, ctx, root_ctx):
        for c in kids(el):
            k = local(c)
            if k in ("subform", "subformSet", "area"):
                self._container(c, ctx, root_ctx)
            elif k == "exclGroup":
                self._radio(c, ctx, root_ctx)
            elif k == "field":
                self._field(c, ctx, root_ctx)

    def _instances(self, sub):
        occ = kid(sub, "occur")
        if occ is None:
            return 1
        try:
            initial = int(occ.get("initial") or occ.get("min") or 1)
        except ValueError:
            initial = 1
        return max(1, initial)

    def _container(self, sub, ctx, root_ctx):
        if local(sub) == "subformSet":
            return self._walk(sub, ctx, root_ctx)
        b = kid(sub, "bind")
        match = b.get("match") if b is not None else None
        name = sub.get("name")
        if local(sub) == "area" or match == "none" or (not name and match != "dataRef"):
            return self._walk(sub, ctx, root_ctx)
        if match == "dataRef":
            ref = b.get("ref") or ""
            n = self._instances(sub) if "[*]" in ref else 1
            for i in range(n):
                self._walk(sub, self._ref_ctx(ctx, root_ctx, ref, i), root_ctx)
            return
        if match == "global":
            return self._walk(sub, f"{root_ctx}/{name}", root_ctx)
        for _ in range(self._instances(sub)):
            self._walk(sub, self._seg(ctx, name), root_ctx)

    def _path(self, node, ctx, root_ctx):
        b = kid(node, "bind")
        match = b.get("match") if b is not None else None
        if match == "none":
            return None
        if match == "dataRef":
            return self._ref_ctx(ctx, root_ctx, b.get("ref") or "")
        name = node.get("name")
        if not name:
            return None
        if match == "global":
            return f"{root_ctx}/{name}"
        return self._seg(ctx, name)

    def _radio(self, grp, ctx, root_ctx):
        path = self._path(grp, ctx, root_ctx)
        if not path:
            return
        opts = []
        for f in kids(grp, "field"):
            disp, _ = item_lists(f)
            opts.append({"name": f.get("name") or "", "on": disp[0] if disp else None, "caption": caption(f)})
        self.fields.append({"path": path, "kind": "radio", "options": opts, "caption": caption(grp)})

    def _field(self, f, ctx, root_ctx):
        kind = ui_kind(f)
        if kind == "other":
            return  # buttons, signatures, barcodes
        path = self._path(f, ctx, root_ctx)
        if not path:
            return
        entry = {"path": path, "kind": kind, "caption": caption(f)}
        disp, save = item_lists(f)
        if kind == "check":
            entry["on"], entry["off"] = (disp + ["1", "0"])[:2] if disp else ("1", "0")
        elif kind == "choice":
            lov = bound_lov(f)
            if lov:
                entry["lov"] = lov
            elif disp:
                entry["items"] = [{"text": d, "value": s} for d, s in zip(disp, save)]
        self.fields.append(entry)


def form_fields(pdf):
    """Resolve the fields of an opened pikepdf.Pdf's XFA template."""
    xfa = pdf.Root.AcroForm.XFA
    parts = {str(xfa[i]): xfa[i + 1] for i in range(0, len(xfa), 2)}
    tpl = etree.fromstring(bytes(parts["template"].read_bytes()))
    return Resolver(tpl).run()
