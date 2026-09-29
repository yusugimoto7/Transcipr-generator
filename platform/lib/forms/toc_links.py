"""Make a compiled package's table of contents clickable.

    python3 toc_links.py in.pdf links.json out.pdf

links.json: [{ "tocPage": 0, "rect": [x1, y1, x2, y2], "target": 12, "label": "1) Purpose of Travel", "level": 0 }, ...]
  tocPage / target are 0-based page indexes in in.pdf; rect is in PDF points.

Each entry becomes a Link annotation on the contents page that jumps to the
target page, and the same entries become the PDF's bookmarks (outlines), nested
one level for a/b/c sub-sections. pikepdf (qpdf) copies the page streams from
disk, so a 200-page package of scans is handled without loading it into memory.
"""
import json
import sys

import pikepdf
from pikepdf import Array, Dictionary, Name, OutlineItem


def main(src, links_file, out):
    with open(links_file, encoding="utf-8") as f:
        links = json.load(f)
    with pikepdf.open(src) as pdf:
        pages = pdf.pages
        for link in links:
            target = int(link["target"])
            toc = int(link["tocPage"])
            if not (0 <= target < len(pages) and 0 <= toc < len(pages)):
                continue
            x1, y1, x2, y2 = [float(v) for v in link["rect"]]
            annot = Dictionary(
                Type=Name.Annot,
                Subtype=Name.Link,
                Rect=Array([x1, y1, x2, y2]),
                Border=Array([0, 0, 0]),
                Dest=Array([pages[target].obj, Name.XYZ, None, None, None]),
            )
            page = pages[toc]
            if "/Annots" not in page.obj:
                page.obj.Annots = Array()
            page.obj.Annots.append(pdf.make_indirect(annot))

        with pdf.open_outline() as outline:
            outline.root.clear()
            parent = None
            for link in links:
                target = int(link["target"])
                if not (0 <= target < len(pages)):
                    continue
                item = OutlineItem(str(link.get("label", "")), target)
                if int(link.get("level", 0)) and parent is not None:
                    parent.children.append(item)
                else:
                    outline.root.append(item)
                    parent = item
        pdf.save(out)


if __name__ == "__main__":
    if len(sys.argv) != 4:
        print(__doc__, file=sys.stderr)
        sys.exit(2)
    main(sys.argv[1], sys.argv[2], sys.argv[3])
