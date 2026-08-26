"""Turn Trello's Markdown into the HTML Odoo stores in description fields.

Deliberately small: Trello card descriptions use a narrow slice of Markdown,
and a full parser would be a dependency with its own escaping bugs. Everything
is HTML-escaped first, so unconverted syntax degrades to visible plain text
rather than to broken markup.
"""

import html
import re

_LINK = re.compile(r"\[([^\]]+)\]\((https?://[^)\s]+)\)")
_BARE_URL = re.compile(r"(?<![\"'>=])(https?://[^\s<]+)")
_BOLD = re.compile(r"\*\*([^*\n]+)\*\*")
_ITALIC = re.compile(r"(?<![*\w])\*([^*\n]+)\*(?!\*)")
_CODE = re.compile(r"`([^`\n]+)`")
_HEADING = re.compile(r"^(#{1,6})\s+(.*)$")
_BULLET = re.compile(r"^\s*[-*]\s+(.*)$")


def _inline(text):
    text = _LINK.sub(lambda m: f'<a href="{m.group(2)}" target="_blank">{m.group(1)}</a>', text)
    text = _BARE_URL.sub(lambda m: f'<a href="{m.group(1)}" target="_blank">{m.group(1)}</a>', text)
    text = _BOLD.sub(r"<strong>\1</strong>", text)
    text = _ITALIC.sub(r"<em>\1</em>", text)
    text = _CODE.sub(r"<code>\1</code>", text)
    return text


def markdown(text):
    if not text or not text.strip():
        return ""
    out = []
    in_list = False
    in_code = False
    for raw in html.escape(text).replace("\r\n", "\n").split("\n"):
        if raw.strip().startswith("```"):
            if in_list:
                out.append("</ul>")
                in_list = False
            out.append("</pre>" if in_code else "<pre>")
            in_code = not in_code
            continue
        if in_code:
            out.append(raw)
            continue

        bullet = _BULLET.match(raw)
        if bullet:
            if not in_list:
                out.append("<ul>")
                in_list = True
            out.append(f"<li>{_inline(bullet.group(1))}</li>")
            continue
        if in_list:
            out.append("</ul>")
            in_list = False

        heading = _HEADING.match(raw)
        if heading:
            level = min(len(heading.group(1)) + 1, 6)
            out.append(f"<h{level}>{_inline(heading.group(2))}</h{level}>")
        elif raw.strip():
            out.append(f"<p>{_inline(raw)}</p>")
    if in_list:
        out.append("</ul>")
    if in_code:
        out.append("</pre>")
    return "\n".join(out)


def escape(text):
    return html.escape(text or "")


def checklists(card_checklists):
    """Render Trello checklists as a static checkbox list."""
    blocks = []
    for checklist in sorted(card_checklists or [], key=lambda c: c.get("pos") or 0):
        items = sorted(checklist.get("checkItems") or [], key=lambda i: i.get("pos") or 0)
        if not items:
            continue
        rows = []
        for item in items:
            done = item.get("state") == "complete"
            mark = "&#9745;" if done else "&#9744;"
            name = _inline(html.escape(item.get("name") or ""))
            rows.append(f"<li>{mark} {f'<s>{name}</s>' if done else name}</li>")
        done_count = sum(1 for i in items if i.get("state") == "complete")
        blocks.append(
            f"<p><strong>{escape(checklist.get('name'))}</strong> "
            f"({done_count}/{len(items)})</p>\n"
            f'<ul style="list-style:none;padding-left:1em">{"".join(rows)}</ul>'
        )
    return "\n".join(blocks)


def footer(card, unmapped_members, link_attachments):
    """Provenance block appended to every migrated task."""
    bits = [f'<p><a href="{card.get("shortUrl")}" target="_blank">Original Trello card</a>']
    if card.get("idShort"):
        bits.append(f" &middot; #{card['idShort']}")
    bits.append("</p>")
    if unmapped_members:
        names = ", ".join(escape(n) for n in unmapped_members)
        bits.append(f"<p><em>Trello members with no Odoo user: {names}</em></p>")
    if link_attachments:
        rows = "".join(
            f'<li><a href="{html.escape(a["url"], quote=True)}" target="_blank">'
            f'{escape(a.get("name") or a["url"])}</a></li>'
            for a in link_attachments
        )
        bits.append(f"<p><strong>Trello links</strong></p><ul>{rows}</ul>")
    return "\n".join(bits)
