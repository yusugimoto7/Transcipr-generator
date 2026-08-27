#!/usr/bin/env python3
"""Migrate Trello boards into Odoo Project.

Mapping
    board            -> project.project
    list             -> project.task.type (stage, scoped to the project)
    label            -> project.tags
    card             -> project.task  (archived cards become inactive tasks)
    checklist        -> rendered into the task description, and optionally
                        into child tasks with --checklist-subtasks
    comment          -> mail.message on the task, original author and date kept
    attachment       -> ir.attachment on the task (files), or a link in the
                        description (URL attachments)

Every run is idempotent: records are keyed by their Trello id through Odoo
external ids, so an interrupted migration is resumed by running it again.

Usage:
    python migrate.py probe
    python migrate.py boards
    python migrate.py users --boards <id>,<id>
    python migrate.py run --boards <id>,<id> --dry-run
    python migrate.py run --boards <id>,<id>
    python migrate.py verify --boards <id>,<id>
"""

import argparse
import base64
import json
import logging
import os
import pathlib
import sys
import xmlrpc.client

from dotenv import load_dotenv

import render
from custom_fields import CustomFieldSync
from odoo_client import Odoo, OdooError
from trello_client import Trello, TrelloError

HERE = pathlib.Path(__file__).resolve().parent
USER_MAP = HERE / "users.json"
REPORT = HERE / "report.json"

log = logging.getLogger("migrate")

TRELLO_LABEL_COLORS = {
    "green": 10, "yellow": 3, "orange": 2, "red": 1, "purple": 6, "blue": 4,
    "sky": 7, "lime": 8, "pink": 9, "black": 5, "null": 0, None: 0,
}
DONE_LIST_HINTS = ("done", "complete", "completed", "shipped", "archive", "finished")


# ---------------------------------------------------------------------------


class Migrator:
    def __init__(self, trello, odoo, args):
        self.trello = trello
        self.odoo = odoo
        self.args = args
        odoo.preload()
        self.user_map = load_user_map()
        self.cfields = None if getattr(args, "no_custom_fields", False) else CustomFieldSync(odoo)
        self._odoo_user_cache = {}
        self.report = {}

        # Odoo 17 renamed the task assignee to a many2many and made the
        # deadline a datetime; 16 and older use user_id / date. Probe rather
        # than assume, so the same script works against either.
        self.multi_assignee = self.odoo.has_field("project.task", "user_ids")
        self.deadline_is_datetime = self.odoo.field_type("project.task", "date_deadline") == "datetime"
        self.done_value = self._done_state_value()
        log.info(
            "Odoo profile: assignees=%s, deadline=%s, done-state=%s",
            "user_ids" if self.multi_assignee else "user_id",
            "datetime" if self.deadline_is_datetime else "date",
            self.done_value or "unsupported",
        )

    def _done_state_value(self):
        field = self.odoo.fields("project.task").get("state") or {}
        values = [v for v, _ in (field.get("selection") or [])]
        for candidate in ("1_done", "done"):
            if candidate in values:
                return candidate
        return None

    # -- users -------------------------------------------------------------

    def odoo_user(self, trello_member_id, members_by_id):
        """Odoo user id for a Trello member, via users.json. None if unmapped."""
        member = members_by_id.get(trello_member_id)
        if not member:
            return None
        login = self.user_map.get(member.get("username"))
        if not login:
            return None
        if login not in self._odoo_user_cache:
            rows = self.odoo.search_read(
                "res.users",
                ["|", ("login", "=", login), ("email", "=", login)],
                ["id", "partner_id"],
                limit=1,
                context={"active_test": False},
            )
            if not rows:
                log.warning("users.json maps %s -> %s, but no such Odoo user exists",
                            member.get("username"), login)
                self._odoo_user_cache[login] = None
            else:
                self._odoo_user_cache[login] = (rows[0]["id"], rows[0]["partner_id"][0])
        return self._odoo_user_cache[login]

    # -- board -------------------------------------------------------------

    def migrate_board(self, board_id):
        board = self.trello.board(board_id)
        log.info("=== %s (%s)", board["name"], board_id)
        data = {
            "lists": self.trello.lists(board_id),
            "labels": self.trello.labels(board_id),
            "members": self.trello.members(board_id),
            "custom_fields": self.trello.custom_fields(board_id),
            "cards": self.trello.cards(board_id),
        }
        data["comments"] = self.trello.comments(board_id)
        data["activity"] = self.trello.activity(board_id) if self.args.include_activity else {}

        stats = {
            "board": board["name"],
            "cards_in_trello": len(data["cards"]),
            "comments_in_trello": sum(len(v) for v in data["comments"].values()),
            "tasks_created": 0, "tasks_existing": 0,
            "subtasks_created": 0, "comments_created": 0, "activity_created": 0,
            "attachments_created": 0, "attachments_skipped": [],
            "custom_fields": len(data["custom_fields"]),
            "unmapped_members": set(),
        }
        self.report[board_id] = stats

        if self.args.dry_run:
            self._plan(board, data, stats)
            return

        project_id = self.ensure_project(board)
        if self.cfields:
            self.cfields.ensure(data["custom_fields"])
            self.cfields.install_view()
        stage_ids = self.ensure_stages(project_id, data["lists"])
        tag_ids = self.ensure_tags(data["labels"])
        members_by_id = {m["id"]: m for m in data["members"]}

        cards = sorted(data["cards"], key=lambda c: (c.get("idList") or "", c.get("pos") or 0))
        for index, card in enumerate(cards):
            task_id, created = self.ensure_task(
                card, project_id, stage_ids, tag_ids, members_by_id, index, stats
            )
            stats["tasks_created" if created else "tasks_existing"] += 1
            if self.args.checklist_subtasks:
                self.ensure_subtasks(card, task_id, project_id, stats)
            self.ensure_comments(card, task_id, data["comments"].get(card["id"], []),
                                 members_by_id, stats)
            if self.args.include_activity:
                self.ensure_activity(card, task_id, data["activity"].get(card["id"], []), stats)
            if not self.args.no_attachments:
                self.ensure_attachments(card, task_id, stats)
            if (index + 1) % 25 == 0:
                log.info("  %d/%d cards", index + 1, len(cards))

        stats["unmapped_members"] = sorted(stats["unmapped_members"])
        log.info("  done: %(tasks_created)s new tasks, %(tasks_existing)s already present, "
                 "%(comments_created)s comments, %(attachments_created)s attachments", stats)

    def _plan(self, board, data, stats):
        existing = self.odoo.ref("board", board["id"])
        already = sum(1 for c in data["cards"] if self.odoo.ref("card", c["id"]))
        unmapped = sorted({
            m["username"] for m in data["members"] if not self.user_map.get(m["username"])
        })
        stats["unmapped_members"] = unmapped
        log.info("  project: %s", "exists, will be reused" if existing else "will be created")
        log.info("  lists -> stages: %d", len(data["lists"]))
        log.info("  labels -> tags: %d", len(data["labels"]))
        log.info("  cards: %d (%d already migrated, %d new)",
                 len(data["cards"]), already, len(data["cards"]) - already)
        log.info("  archived cards: %d", sum(1 for c in data["cards"] if c.get("closed")))
        log.info("  comments: %d", stats["comments_in_trello"])
        log.info("  custom fields -> Odoo fields on project.task: %d",
                 len(data["custom_fields"]))
        log.info("  attachments: %d",
                 sum(len(c.get("attachments") or []) for c in data["cards"]))
        if unmapped:
            log.warning("  members with no Odoo user in users.json: %s", ", ".join(unmapped))

    # -- structure ---------------------------------------------------------

    def ensure_project(self, board):
        vals = {"name": board["name"]}
        if self.odoo.has_field("project.project", "description"):
            desc = render.markdown(board.get("desc"))
            footer = (f'<p><a href="{board.get("url")}" target="_blank">'
                      "Original Trello board</a></p>")
            vals["description"] = f"{desc}\n{footer}" if desc else footer
        project_id, created = self.odoo.upsert("board", board["id"], "project.project", vals)
        log.info("  project %s (id %s)", "created" if created else "reused", project_id)
        return project_id

    def ensure_stages(self, project_id, lists):
        stage_ids = {}
        for sequence, lst in enumerate(sorted(lists, key=lambda l: l.get("pos") or 0)):
            folded = lst.get("closed") or any(
                hint in (lst["name"] or "").lower() for hint in DONE_LIST_HINTS
            )
            vals = {
                "name": lst["name"],
                "sequence": sequence * 10,
                "fold": bool(folded),
                "project_ids": [(4, project_id)],
            }
            stage_id, _ = self.odoo.upsert("list", lst["id"], "project.task.type", vals)
            stage_ids[lst["id"]] = stage_id
        log.info("  %d stages ready", len(stage_ids))
        return stage_ids

    def ensure_tags(self, labels):
        tag_ids = {}
        for label in labels:
            name = (label.get("name") or "").strip() or f"Trello {label.get('color') or 'label'}"
            vals = {"name": name}
            if self.odoo.has_field("project.tags", "color"):
                vals["color"] = TRELLO_LABEL_COLORS.get(label.get("color"), 0)
            existing = self.odoo.ref("label", label["id"])
            if not existing:
                # Reuse a same-named tag rather than creating a duplicate.
                rows = self.odoo.search_read("project.tags", [("name", "=", name)], ["id"], limit=1)
                if rows:
                    self.odoo.stamp("label", label["id"], "project.tags", rows[0]["id"])
                    tag_ids[label["id"]] = rows[0]["id"]
                    continue
            tag_id, _ = self.odoo.upsert("label", label["id"], "project.tags", vals)
            tag_ids[label["id"]] = tag_id
        log.info("  %d tags ready", len(tag_ids))
        return tag_ids

    # -- tasks -------------------------------------------------------------

    def task_values(self, card, project_id, stage_ids, tag_ids, members_by_id, sequence, stats):
        assignees, unmapped = [], []
        for member_id in card.get("idMembers") or []:
            resolved = self.odoo_user(member_id, members_by_id)
            if resolved:
                assignees.append(resolved[0])
            else:
                member = members_by_id.get(member_id) or {}
                name = member.get("fullName") or member.get("username") or member_id
                unmapped.append(name)
                if member.get("username"):
                    stats["unmapped_members"].add(member["username"])

        _, link_attachments = split_attachments(card)
        field_rows = self.cfields.labelled(card) if self.cfields else []
        body = render.rtl_safe("\n".join(part for part in (
            render.custom_fields_table(field_rows),
            render.markdown(card.get("desc")),
            render.checklists(card.get("checklists")),
            render.footer(card, unmapped, link_attachments),
        ) if part))

        vals = {
            "name": card.get("name") or "(untitled Trello card)",
            "project_id": project_id,
            "description": body,
            "sequence": sequence * 10,
            "active": not card.get("closed"),
        }
        stage_id = stage_ids.get(card.get("idList"))
        if stage_id:
            vals["stage_id"] = stage_id
        if card.get("due"):
            due = card["due"].replace("T", " ").split(".")[0]
            vals["date_deadline"] = due if self.deadline_is_datetime else due.split(" ")[0]
        if tag_ids:
            labels = [tag_ids[l] for l in (card.get("idLabels") or []) if l in tag_ids]
            if labels:
                vals["tag_ids"] = [(6, 0, labels)]
        if assignees:
            if self.multi_assignee:
                vals["user_ids"] = [(6, 0, assignees)]
            else:
                # Odoo <=17 holds a single assignee; the rest stay in the footer.
                vals["user_id"] = assignees[0]
                unmapped.extend(
                    members_by_id[m]["fullName"] for m in (card.get("idMembers") or [])[1:]
                    if m in members_by_id
                )
        if card.get("dueComplete") and self.done_value:
            vals["state"] = self.done_value
        if self.cfields:
            vals.update(self.cfields.values(card))
        return vals

    def ensure_task(self, card, project_id, stage_ids, tag_ids, members_by_id, sequence, stats):
        vals = self.task_values(
            card, project_id, stage_ids, tag_ids, members_by_id, sequence, stats
        )
        # On a rerun, don't stomp fields a human has since edited in Odoo:
        # refresh only when --update is passed.
        return self.odoo.upsert(
            "card", card["id"], "project.task", vals, update=self.args.update
        )

    def ensure_subtasks(self, card, parent_id, project_id, stats):
        for checklist in sorted(card.get("checklists") or [], key=lambda c: c.get("pos") or 0):
            items = sorted(checklist.get("checkItems") or [], key=lambda i: i.get("pos") or 0)
            for sequence, item in enumerate(items):
                done = item.get("state") == "complete"
                vals = {
                    "name": item.get("name") or "(unnamed checklist item)",
                    "project_id": project_id,
                    "parent_id": parent_id,
                    "sequence": sequence * 10,
                }
                if done and self.done_value:
                    vals["state"] = self.done_value
                _, created = self.odoo.upsert(
                    "item", item["id"], "project.task", vals, update=self.args.update
                )
                if created:
                    stats["subtasks_created"] += 1

    def ensure_comments(self, card, task_id, comments, members_by_id, stats):
        for action in comments:
            if self.odoo.ref("comment", action["id"]):
                continue
            author = action.get("memberCreator") or {}
            resolved = self.odoo_user(author.get("id"), members_by_id)
            text = render.markdown((action.get("data") or {}).get("text") or "")
            byline = render.escape(author.get("fullName") or author.get("username") or "Trello user")
            body = render.rtl_safe(
                f'<p><em>Trello comment by {byline} on {action.get("date", "")[:10]}</em></p>\n{text}'
            )

            kwargs = {
                "body": body,
                "message_type": "comment",
                # A log note, not a comment: comments notify every follower,
                # which would email the whole team once per migrated comment.
                "subtype_xmlid": "mail.mt_note" if self.args.comments_as_notes else "mail.mt_comment",
            }
            if resolved:
                kwargs["author_id"] = resolved[1]
            message_id = self.odoo.execute(
                "project.task", "message_post", [task_id],
                context=self.odoo.write_context(), **kwargs
            )
            if not message_id:
                continue
            # message_post stamps "now"; restore the original Trello timestamp.
            try:
                self.odoo.write(
                    "mail.message", [message_id],
                    {"date": (action.get("date") or "").replace("T", " ").split(".")[0]},
                )
            except OdooError as exc:
                log.debug("could not backdate message %s: %s", message_id, exc)
            self.odoo.stamp("comment", action["id"], "mail.message", message_id)
            stats["comments_created"] += 1

    def ensure_activity(self, card, task_id, actions, stats):
        """Card creations and list moves, as dated log notes on the task."""
        for action in actions:
            if self.odoo.ref("act", action["id"]):
                continue
            data = action.get("data") or {}
            who = (action.get("memberCreator") or {}).get("fullName") or "Someone"
            when = (action.get("date") or "")[:10]
            if action["type"] == "updateCard":
                text = (f'moved this card from {render.escape(data["listBefore"]["name"])} '
                        f'to {render.escape(data["listAfter"]["name"])}'
                        if "listBefore" in data
                        else f'moved this card to {render.escape(data["listAfter"]["name"])}')
            else:
                list_name = (data.get("list") or {}).get("name", "")
                text = f"added this card to {render.escape(list_name)}"
            message_id = self.odoo.execute(
                "project.task", "message_post", [task_id],
                context=self.odoo.write_context(),
                body=f"<p><em>{render.escape(who)} {text} on {when} (Trello)</em></p>",
                message_type="comment", subtype_xmlid="mail.mt_note",
            )
            if not message_id:
                continue
            try:
                self.odoo.write("mail.message", [message_id],
                                {"date": (action.get("date") or "").replace("T", " ").split(".")[0]})
            except OdooError:
                pass
            self.odoo.stamp("act", action["id"], "mail.message", message_id)
            stats["activity_created"] += 1

    def ensure_attachments(self, card, task_id, stats):
        file_attachments, _ = split_attachments(card)
        limit = self.args.max_attachment_mb * 1024 * 1024
        for attachment in file_attachments:
            if self.odoo.ref("att", attachment["id"]):
                continue
            size = attachment.get("bytes") or 0
            if size > limit:
                stats["attachments_skipped"].append(
                    {"card": card.get("name"), "name": attachment.get("name"),
                     "mb": round(size / 1024 / 1024, 1), "url": attachment.get("url")}
                )
                continue
            try:
                blob = self.trello.download(attachment["url"])
            except TrelloError as exc:
                log.warning("attachment %s could not be downloaded: %s",
                            attachment.get("name"), exc)
                stats["attachments_skipped"].append(
                    {"card": card.get("name"), "name": attachment.get("name"),
                     "error": str(exc), "url": attachment.get("url")}
                )
                continue
            vals = {
                "name": attachment.get("name") or "trello-attachment",
                "res_model": "project.task",
                "res_id": task_id,
                "type": "binary",
                "datas": base64.b64encode(blob).decode(),
            }
            if attachment.get("mimeType"):
                vals["mimetype"] = attachment["mimeType"]
            attachment_id, _ = self.odoo.upsert("att", attachment["id"], "ir.attachment", vals)
            stats["attachments_created"] += 1

    # -- verify ------------------------------------------------------------

    def verify_board(self, board_id):
        board = self.trello.board(board_id)
        cards = self.trello.cards(board_id)
        comments = self.trello.comments(board_id)
        project_id = self.odoo.ref("board", board["id"])
        missing_cards = [c for c in cards if not self.odoo.ref("card", c["id"])]
        missing_comments = [
            a["id"] for actions in comments.values() for a in actions
            if not self.odoo.ref("comment", a["id"])
        ]
        file_attachments = [a for c in cards for a in split_attachments(c)[0]]
        limit = self.args.max_attachment_mb * 1024 * 1024
        unmigrated = [a for a in file_attachments if not self.odoo.ref("att", a["id"])]
        # Files past the size limit were skipped on purpose; counting them as
        # missing would leave verify permanently red.
        oversize = [a for a in unmigrated if (a.get("bytes") or 0) > limit]
        missing_attachments = [a for a in unmigrated if a not in oversize]

        in_odoo = self.odoo.execute(
            "project.task", "search_count",
            [("project_id", "=", project_id), ("parent_id", "=", False)],
            context={"active_test": False},
        ) if project_id else 0

        log.info("=== %s", board["name"])
        log.info("  project in Odoo: %s", project_id or "MISSING")
        log.info("  cards: %d in Trello, %d top-level tasks in Odoo, %d unmigrated",
                 len(cards), in_odoo, len(missing_cards))
        log.info("  comments: %d in Trello, %d unmigrated",
                 sum(len(v) for v in comments.values()), len(missing_comments))
        log.info("  file attachments: %d in Trello, %d unmigrated, %d skipped as oversize",
                 len(file_attachments), len(missing_attachments), len(oversize))
        for attachment in oversize:
            log.info("    oversize (still on Trello): %s — %s",
                     attachment.get("name"),
                     f'{(attachment.get("bytes") or 0) / 1024 / 1024:.0f} MB')
        for card in missing_cards[:10]:
            log.warning("    missing card: %s", card.get("name"))
        return not (missing_cards or missing_comments or missing_attachments)


# ---------------------------------------------------------------------------


def split_attachments(card):
    """Trello attachments split into uploaded files and plain links."""
    files, links = [], []
    for attachment in card.get("attachments") or []:
        if not attachment.get("url"):
            continue
        (files if attachment.get("isUpload") else links).append(attachment)
    return files, links


def load_user_map():
    if not USER_MAP.exists():
        return {}
    raw = json.loads(USER_MAP.read_text())
    return {k: v for k, v in raw.items() if v}


def cmd_probe(args, env):
    url = env("ODOO_URL")
    if not url:
        sys.exit("ODOO_URL is not set in .env")
    common = xmlrpc.client.ServerProxy(f"{url.rstrip('/')}/xmlrpc/2/common", allow_none=True)
    print("Odoo version:", json.dumps(common.version(), indent=2))
    try:
        db = xmlrpc.client.ServerProxy(f"{url.rstrip('/')}/xmlrpc/2/db", allow_none=True)
        print("Databases:", db.list())
    except Exception as exc:  # db listing is commonly disabled in production
        print("Database list unavailable (normal on hosted Odoo):", exc)
        print("Use the database name shown on the login page, or ask your admin.")
    if env("ODOO_DB") and env("ODOO_USERNAME"):
        odoo = Odoo(url, env("ODOO_DB"), env("ODOO_USERNAME"), env("ODOO_PASSWORD"))
        odoo.login()
        print("Login OK. project.task fields present:",
              [f for f in ("user_ids", "user_id", "date_deadline", "state")
               if odoo.has_field("project.task", f)])


def cmd_auth_url(args, env):
    print(Trello(env("TRELLO_API_KEY"), "placeholder").auth_url())


def cmd_boards(args, env):
    trello = Trello(env("TRELLO_API_KEY"), env("TRELLO_TOKEN"))
    for board in trello.my_boards():
        flag = " [closed]" if board.get("closed") else ""
        print(f'{board["id"]}  {board["name"]}{flag}')


def cmd_users(args, env):
    trello = Trello(env("TRELLO_API_KEY"), env("TRELLO_TOKEN"))
    mapping = json.loads(USER_MAP.read_text()) if USER_MAP.exists() else {}
    for board_id in args.boards:
        for member in trello.members(board_id):
            mapping.setdefault(member["username"], "")
    USER_MAP.write_text(json.dumps(mapping, indent=2, sort_keys=True) + "\n")
    print(f"Wrote {USER_MAP} with {len(mapping)} Trello members.")
    print("Fill in each Odoo login (email) — leave blank to skip that person; "
          "unmapped members are named in the task description instead.")


def cmd_run(args, env):
    trello = Trello(env("TRELLO_API_KEY"), env("TRELLO_TOKEN"))
    odoo = Odoo(env("ODOO_URL"), env("ODOO_DB"), env("ODOO_USERNAME"), env("ODOO_PASSWORD"))
    odoo.login()
    migrator = Migrator(trello, odoo, args)
    if args.dry_run:
        log.info("DRY RUN — nothing will be written to Odoo")
    for board_id in args.boards:
        migrator.migrate_board(board_id)
    REPORT.write_text(json.dumps(migrator.report, indent=2, default=list) + "\n")
    log.info("Report written to %s", REPORT)


def cmd_fields(args, env):
    trello = Trello(env("TRELLO_API_KEY"), env("TRELLO_TOKEN"))
    odoo = Odoo(env("ODOO_URL"), env("ODOO_DB"), env("ODOO_USERNAME"), env("ODOO_PASSWORD"))
    odoo.login()
    syncer = CustomFieldSync(odoo)
    for board_id in args.boards:
        definitions = trello.custom_fields(board_id)
        log.info("board %s: %d custom fields", board_id, len(definitions))
        syncer.ensure(definitions)
    syncer.install_view()
    print(f"{len(syncer.by_trello_id)} Trello custom fields are now Odoo fields on project.task.")


def cmd_verify(args, env):
    trello = Trello(env("TRELLO_API_KEY"), env("TRELLO_TOKEN"))
    odoo = Odoo(env("ODOO_URL"), env("ODOO_DB"), env("ODOO_USERNAME"), env("ODOO_PASSWORD"))
    odoo.login()
    migrator = Migrator(trello, odoo, args)
    ok = all([migrator.verify_board(board_id) for board_id in args.boards])
    print("\nAll boards fully migrated." if ok
          else "\nSome objects are still unmigrated — rerun `run` to finish them.")
    sys.exit(0 if ok else 1)


def build_parser():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("-v", "--verbose", action="store_true")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("probe", help="check Odoo connectivity, version and field layout")
    sub.add_parser("auth-url", help="print the URL that issues a Trello token")
    sub.add_parser("boards", help="list Trello boards and their ids")

    def with_boards(sp):
        sp.add_argument("--boards", required=True,
                        type=lambda s: [b.strip() for b in s.split(",") if b.strip()],
                        help="comma-separated Trello board ids (see `boards`)")
        return sp

    with_boards(sub.add_parser("users", help="write users.json to map Trello members to Odoo users"))

    run = with_boards(sub.add_parser("run", help="migrate the boards"))
    run.add_argument("--dry-run", action="store_true",
                     help="report what would be migrated without writing to Odoo")
    run.add_argument("--update", action="store_true",
                     help="on a rerun, overwrite existing tasks with Trello's current content "
                          "(default: leave already-migrated records untouched)")
    run.add_argument("--checklist-subtasks", action="store_true",
                     help="also create a child task per checklist item")
    run.add_argument("--include-activity", action="store_true",
                     help="also migrate card history (created / moved between lists) as "
                          "dated log notes")
    run.add_argument("--no-custom-fields", action="store_true",
                     help="do not create Odoo fields for Trello custom fields (their values "
                          "still appear in the task description)")
    run.add_argument("--no-attachments", action="store_true",
                     help="skip file attachments (much faster; links still land in the description)")
    run.add_argument("--max-attachment-mb", type=float, default=25.0,
                     help="skip files larger than this and list them in the report (default 25)")
    run.add_argument("--comments-as-notes", action="store_true", default=True,
                     help="post comments as internal log notes (default; avoids mass email)")
    run.add_argument("--comments-as-messages", dest="comments_as_notes", action="store_false",
                     help="post comments as real messages — notifies every follower by email")

    with_boards(sub.add_parser(
        "fields", help="create the Odoo fields for Trello custom fields, without migrating cards"))

    verify = with_boards(sub.add_parser("verify", help="compare Trello and Odoo counts"))
    verify.add_argument("--max-attachment-mb", type=float, default=25.0,
                        help="the limit used during `run`, so skipped files are not "
                             "reported as missing (default 25)")
    return parser


def main():
    args = build_parser().parse_args()
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)-7s %(message)s",
        datefmt="%H:%M:%S",
    )
    load_dotenv(HERE / ".env")

    def env(name):
        return os.environ.get(name, "").strip()

    handlers = {
        "probe": cmd_probe, "auth-url": cmd_auth_url, "boards": cmd_boards,
        "users": cmd_users, "fields": cmd_fields, "run": cmd_run, "verify": cmd_verify,
    }
    try:
        handlers[args.command](args, env)
    except (TrelloError, OdooError) as exc:
        sys.exit(f"error: {exc}")
    except KeyboardInterrupt:
        sys.exit("\ninterrupted — rerun the same command to resume")


if __name__ == "__main__":
    main()
