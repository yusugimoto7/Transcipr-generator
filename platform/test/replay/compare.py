#!/usr/bin/env python3
"""
Compare two sets of final files for the IRCC portal: the team's (from a past
client's "02 - Final Files" folder) and the platform's (built from the same
client's documents).

    python3 compare.py TEAM_DIR PLATFORM_DIR  ->  JSON on stdout

For every file: which file it matches on the other side (by its label:
"05 - Client Information - Zahra.pdf" -> "client information"; forms by their
IMM number), page counts, the pages one side has and the other does not
(matched by a small picture of each page, or by its text), and for a filled
IRCC form every box whose value differs. Files only one side has are listed,
and the order of the files on each side.

The output holds whatever the files say (names, numbers): it stays on this
machine and in the firm's reports folder, never in the repository.
"""
import difflib
import json
import os
import re
import subprocess
import sys
import tempfile

import pikepdf
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
AUDIT = os.path.join(HERE, "..", "e2e", "audit_form.py")
PDF_EXT = {".pdf"}
IMG_EXT = {".jpg", ".jpeg", ".png", ".webp"}
# The form's own bookkeeping, barcodes and signature boxes: not compared.
META = re.compile(
    r"(^|/)(FormVersion|FormName|ReaderInfo|ApplicationValidat\w*|FormValidated|Validated\w*|CRCNum|"
    r"Page\d/TextField1(\[\d\])?|num(\[\d\])?|totPage(\[\d\])?|FormNumber(\[\d\])?|signat\w*(\[\d\])?|"
    r"Signature\w*|dateSigned(\[\d\])?|date\w*Signed|Barcode\w*)$",
    re.I,
)


def label(name):
    """'05 - Client Information - Zahra.pdf' -> 'client information'; forms -> 'imm1295'."""
    base = os.path.splitext(name)[0]
    m = re.search(r"imm\s*[_-]?\s*(\d{4})\s*(?:[_-]?\s*(1|b)(?=[^0-9]|$))?", base, re.I)
    if m:
        return f"imm{m.group(1)}" + ("b" if m.group(2) else "")
    base = re.sub(r"^\s*\d{1,3}\s*[-_.]\s*", "", base)
    first = re.split(r"\s+-\s+", base)[0]
    first = re.sub(r"\(.*?\)", "", first)
    return re.sub(r"[^a-z0-9]+", " ", first.lower()).strip()


def files_in(d):
    out = []
    for n in sorted(os.listdir(d)):
        ext = os.path.splitext(n)[1].lower()
        if ext in PDF_EXT | IMG_EXT and not n.startswith("."):
            out.append(n)
    return out


def dhash(img, size=8):
    g = img.convert("L").resize((size + 1, size), Image.LANCZOS)
    px = list(g.get_flattened_data() if hasattr(g, "get_flattened_data") else g.getdata())
    bits = 0
    for r in range(size):
        for c in range(size):
            bits = (bits << 1) | (px[r * (size + 1) + c] > px[r * (size + 1) + c + 1])
    return bits


def pages(path):
    """[{text, hash}] per page."""
    ext = os.path.splitext(path)[1].lower()
    if ext in IMG_EXT:
        with Image.open(path) as im:
            return [{"text": "", "hash": dhash(im)}]
    out = []
    try:
        txt = subprocess.run(["pdftotext", "-q", path, "-"], capture_output=True, text=True, timeout=120).stdout
        texts = txt.split("\f")
    except Exception:
        texts = []
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(["pdftoppm", "-q", "-r", "18", "-gray", "-png", path, os.path.join(tmp, "p")], timeout=300)
        imgs = sorted(f for f in os.listdir(tmp) if f.endswith(".png"))
        for i, f in enumerate(imgs):
            with Image.open(os.path.join(tmp, f)) as im:
                h = dhash(im)
            out.append({"text": texts[i] if i < len(texts) else "", "hash": h})
    if not out:
        try:
            n = len(pikepdf.open(path).pages)
        except Exception:
            n = 0
        out = [{"text": texts[i] if i < len(texts) else "", "hash": None} for i in range(n)]
    return out


def words(t):
    return set(w for w in re.findall(r"[a-z0-9]{3,}", (t or "").lower()))


def similar(a, b):
    # Pages with text are matched by their words; scans (no text) by their picture.
    wa, wb = words(a["text"]), words(b["text"])
    if len(wa) >= 8 and len(wb) >= 8:
        return len(wa & wb) / len(wa | wb) >= 0.6
    if a["hash"] is not None and b["hash"] is not None:
        return bin(a["hash"] ^ b["hash"]).count("1") <= 6
    return False


def page_diff(tp, pp):
    """Team pages with no similar platform page, and the other way round (1-based)."""
    used = set()
    missing = []
    for i, t in enumerate(tp):
        hit = next((j for j, p in enumerate(pp) if j not in used and similar(t, p)), None)
        if hit is None:
            missing.append({"page": i + 1, "text": re.sub(r"\s+", " ", t["text"]).strip()[:100]})
        else:
            used.add(hit)
    extra = [{"page": j + 1, "text": re.sub(r"\s+", " ", p["text"]).strip()[:100]} for j, p in enumerate(pp) if j not in used]
    return missing, extra


def has_xfa(path):
    try:
        pdf = pikepdf.open(path)
        return "/AcroForm" in pdf.Root and "/XFA" in pdf.Root.AcroForm
    except Exception:
        return False


def audit(path):
    py = os.environ.get("PYTHON_BIN") or sys.executable
    r = subprocess.run([py, AUDIT, path], capture_output=True, text=True, timeout=300)
    if r.returncode != 0:
        return None
    return {f["path"]: f for f in json.loads(r.stdout)["fields"] if not META.search(f["path"]) and "ValidationDate/" not in f["path"]}


def norm(v):
    return re.sub(r"\s+", " ", str(v or "")).strip().casefold()


def form_diff(tpath, ppath):
    if not has_xfa(tpath):
        return {"comparable": False, "why": "the team's copy has no form data (scanned or flattened)"}
    t, p = audit(tpath), audit(ppath) if has_xfa(ppath) else None
    if t is None or p is None:
        return {"comparable": False, "why": "could not read the form data"}
    diffs, same, team_only, platform_only = [], 0, 0, 0
    for path in sorted(set(t) | set(p)):
        a, b = t.get(path), p.get(path)
        av, bv = (a or {}).get("shown") or (a or {}).get("value") or "", (b or {}).get("shown") or (b or {}).get("value") or ""
        if not av and not bv:
            continue
        if norm(av) == norm(bv):
            same += 1
            continue
        if av and not bv:
            team_only += 1
        elif bv and not av:
            platform_only += 1
        diffs.append({"path": path, "caption": (a or b or {}).get("caption", ""), "team": av, "platform": bv})
    return {"comparable": True, "same": same, "teamOnly": team_only, "platformOnly": platform_only, "diffs": diffs}


def main(team_dir, plat_dir):
    tf, pf = files_in(team_dir), files_in(plat_dir)
    tl, pl = {n: label(n) for n in tf}, {n: label(n) for n in pf}
    pairs, left = [], list(pf)
    for n in tf:
        hit = next((m for m in left if pl[m] == tl[n]), None)
        if hit is None:
            best = max(left, key=lambda m: difflib.SequenceMatcher(None, tl[n], pl[m]).ratio(), default=None)
            if best and difflib.SequenceMatcher(None, tl[n], pl[best]).ratio() >= 0.75:
                hit = best
        if hit:
            left.remove(hit)
        pairs.append((n, hit))
    out = {"files": [], "teamOnly": [], "platformOnly": left, "order": {"team": [tl[n] for n in tf], "platform": [pl[n] for n in pf]}}
    for t, p in pairs:
        if not p:
            tp = pages(os.path.join(team_dir, t))
            out["teamOnly"].append({"name": t, "label": tl[t], "pages": len(tp)})
            continue
        tpath, ppath = os.path.join(team_dir, t), os.path.join(plat_dir, p)
        entry = {"label": tl[t], "team": t, "platform": p}
        if tl[t].startswith("imm"):
            tp, pp = pages(tpath), pages(ppath)
            entry.update(teamPages=len(tp), platformPages=len(pp), form=form_diff(tpath, ppath))
        else:
            tp, pp = pages(tpath), pages(ppath)
            missing, extra = page_diff(tp, pp)
            entry.update(teamPages=len(tp), platformPages=len(pp), pagesOnlyTeam=missing, pagesOnlyPlatform=extra)
        out["files"].append(entry)
    return out


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit("usage: compare.py TEAM_DIR PLATFORM_DIR")
    print(json.dumps(main(sys.argv[1], sys.argv[2]), ensure_ascii=False, indent=1))
