"""Read the marker positions out of the tokenized PDFs into tokens.json.

Run after tokenize_docs.py and the docx -> pdf conversion:

    soffice --headless --convert-to pdf --outdir . TR-retainer.docx PR-retainer.docx
    python extract_tokens.py
"""
import json
import pathlib
import re

import pdfplumber

HERE = pathlib.Path(__file__).resolve().parent
PDFS = {"TR": "TR-retainer.pdf", "PR": "PR-retainer.pdf"}
MARK = re.compile(r"ZQ([A-Z0-9_]+)ZQ")


def extract(pdf_path):
    out = {"tokens": {}}
    with pdfplumber.open(pdf_path) as pdf:
        out["W"], out["H"] = pdf.pages[0].width, pdf.pages[0].height
        out["pages"] = len(pdf.pages)
        for pno, page in enumerate(pdf.pages, start=1):
            for w in page.extract_words(keep_blank_chars=False):
                m = MARK.search(w["text"])
                if not m:
                    continue
                name = m.group(1)
                if name in out["tokens"]:
                    raise SystemExit(f"{pdf_path.name}: marker {name} appears twice")
                out["tokens"][name] = {"page": pno, "x0": round(w["x0"], 1), "top": round(w["top"], 1),
                                       "x1": round(w["x1"], 1), "bottom": round(w["bottom"], 1)}
    return out


if __name__ == "__main__":
    data = {kind: extract(HERE / name) for kind, name in PDFS.items()}
    (HERE / "tokens.json").write_text(json.dumps(data, indent=1), encoding="utf-8")
    for kind, doc in data.items():
        print(f"{kind}: {doc['pages']} pages, {len(doc['tokens'])} markers: {', '.join(sorted(doc['tokens']))}")
