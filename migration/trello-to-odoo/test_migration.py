"""Offline test: run the migrator against fake Trello + fake Odoo."""
import argparse, json, logging, sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import migrate
from migrate import Migrator

logging.basicConfig(level=logging.INFO, format="%(message)s")

BOARD = {"id": "b1", "name": "Sales Pipeline", "desc": "Board **desc**", "url": "https://trello.com/b/b1"}
LISTS = [{"id": "l1", "name": "To Do", "pos": 1, "closed": False},
         {"id": "l2", "name": "Done", "pos": 2, "closed": False}]
LABELS = [{"id": "lab1", "name": "Urgent", "color": "red"},
          {"id": "lab2", "name": "", "color": "sky"}]
MEMBERS = [{"id": "m1", "username": "yusugimoto", "fullName": "Yu Sugimoto"},
           {"id": "m2", "username": "ghost", "fullName": "Ghost Member"}]
CARDS = [
    {"id": "c1", "name": "Call client", "desc": "- step one\n- step two", "closed": False,
     "due": "2026-09-01T16:00:00.000Z", "dueComplete": False, "idList": "l1",
     "idLabels": ["lab1"], "idMembers": ["m1", "m2"], "pos": 1, "idShort": 4,
     "shortUrl": "https://trello.com/c/c1", "attachments": [
         {"id": "a1", "name": "quote.pdf", "url": "https://trello.com/f/a1", "bytes": 1024,
          "mimeType": "application/pdf", "isUpload": True},
         {"id": "a2", "name": "Website", "url": "https://example.com", "isUpload": False},
         {"id": "a3", "name": "huge.zip", "url": "https://trello.com/f/a3",
          "bytes": 900 * 1024 * 1024, "isUpload": True}],
     "checklists": [{"id": "cl1", "name": "QA", "pos": 1, "checkItems": [
         {"id": "ci1", "name": "verify", "state": "complete", "pos": 1},
         {"id": "ci2", "name": "sign off", "state": "incomplete", "pos": 2}]}]},
    {"id": "c2", "name": "Archived thing", "desc": "", "closed": True, "due": None,
     "dueComplete": False, "idList": "l2", "idLabels": [], "idMembers": [], "pos": 2,
     "idShort": 5, "shortUrl": "https://trello.com/c/c2", "attachments": [], "checklists": []},
]
COMMENTS = {"c1": [{"id": "act1", "date": "2026-08-01T10:00:00.000Z",
                    "memberCreator": {"id": "m1", "username": "yusugimoto", "fullName": "Yu Sugimoto"},
                    "data": {"text": "Called them, **no answer**", "card": {"id": "c1"}}}]}


CUSTOM_FIELDS = [
    {"id": "cf1", "name": "Passport No.", "type": "text"},
    {"id": "cf2", "name": "1st Prog. Deadline", "type": "date"},
    {"id": "cf3", "name": "Spouse Age", "type": "number"},
    {"id": "cf4", "name": "Priority", "type": "list",
     "options": [{"id": "o1", "value": {"text": "High"}}, {"id": "o2", "value": {"text": "Low"}}]},
    {"id": "cf5", "name": "2nd Payment OK", "type": "checkbox"},
    {"id": "cf6", "name": "Passport No!", "type": "text"},
    {"id": "cf7", "name": "Weird", "type": "unsupported-type"},
]

CARDS[0]["customFieldItems"] = [
    {"idCustomField": "cf1", "value": {"text": "W310078746"}},
    {"idCustomField": "cf2", "value": {"date": "2026-09-30T00:00:00.000Z"}},
    {"idCustomField": "cf3", "value": {"number": "34"}},
    {"idCustomField": "cf4", "idValue": "o1"},
    {"idCustomField": "cf5", "value": {"checked": "true"}},
]
CARDS[1]["customFieldItems"] = []
# A Farsi card, as on the real board.
CARDS[0]["desc"] = "\u0627\u06cc\u0645\u06cc\u0644 \u0627\u0635\u0644\u06cc \u06a9\u0644\u0627\u06cc\u0646\u062a\n\n- step one\n- step two"


ACTIVITY = {"c1": [
    {"id": "act9", "type": "updateCard", "date": "2026-08-22T06:23:00.000Z",
     "memberCreator": {"fullName": "Parto Bararhosseini"},
     "data": {"card": {"id": "c1"}, "listBefore": {"name": "Settled JR files"},
              "listAfter": {"name": "Request Letter Received"}}},
    {"id": "act8", "type": "createCard", "date": "2026-08-01T06:00:00.000Z",
     "memberCreator": {"fullName": "Parto Bararhosseini"},
     "data": {"card": {"id": "c1"}, "list": {"name": "Settled JR files"}}},
]}


class FakeTrello:
    def board(self, i): return BOARD
    def lists(self, i): return LISTS
    def labels(self, i): return LABELS
    def members(self, i): return MEMBERS
    def cards(self, i): return json.loads(json.dumps(CARDS))
    def custom_fields(self, i): return json.loads(json.dumps(CUSTOM_FIELDS))
    def activity(self, i): return json.loads(json.dumps(ACTIVITY))
    def comments(self, i): return json.loads(json.dumps(COMMENTS))
    def download(self, url): return b"PDFBYTES"


class FakeOdoo:
    FIELDS = {
        "project.task": {"user_ids": {"type": "many2many"}, "date_deadline": {"type": "datetime"},
                         "state": {"type": "selection",
                                   "selection": [["01_in_progress", "In Progress"], ["1_done", "Done"]]},
                         "name": {"type": "char"}},
        "project.project": {"description": {"type": "html"}, "name": {"type": "char"}},
        "project.tags": {"color": {"type": "integer"}, "name": {"type": "char"}},
        "project.task.type": {"name": {"type": "char"}},
    }

    def __init__(self):
        self.records, self.xmlids, self.calls, self._seq = {}, {}, [], 0
        self.records["res.users"] = {1: {"id": 1, "login": "yu@sugimotogroup.org", "partner_id": [7, "Yu"]}}

    def login(self): return 2
    def write_context(self): return {"tracking_disable": True}
    def fields(self, m): return self.FIELDS.get(m, {})
    def has_field(self, m, f): return f in self.fields(m)
    def field_type(self, m, f): return (self.fields(m).get(f) or {}).get("type")
    @staticmethod
    def key(kind, tid): return f"{kind}_{tid}"

    def _new_id(self):
        self._seq += 1
        return self._seq

    def search_read(self, model, domain, fields, **kw):
        if model == "res.users":
            return [self.records["res.users"][1]]
        if model == "ir.model":
            return [{"id": 99}]
        if model == "ir.model.fields":
            flat = dict(d[:2] for d in domain if isinstance(d, (list, tuple)) and len(d) == 3
                        for _ in [0])
            hits = [dict(v, id=k) for k, v in self.records.get("ir.model.fields", {}).items()]
            for clause in domain:
                if clause[0] == "id":
                    hits = [h for h in hits if h["id"] == clause[2]]
            return hits
        if model == "ir.model.data":  # parent form view lookup
            return [{"res_id": 500}]
        return []

    _field_cache = {}

    def execute(self, model, method, *args, **kw):
        self.calls.append((model, method))
        if method == "message_post":
            mid = self._new_id()
            self.records.setdefault("mail.message", {})[mid] = dict(kw, task=args[0])
            return mid
        if method == "search_count":
            return sum(1 for r in self.records.get("project.task", {}).values()
                       if not r.get("parent_id"))
        if method == "create":
            rid = self._new_id()
            self.records.setdefault(model, {})[rid] = dict(args[0])
            return rid
        if method == "write":
            for rid in args[0]:
                self.records.setdefault(model, {}).setdefault(rid, {}).update(args[1])
            return True
        if method == "exists":
            return [i for i in args[0] if i in self.records.get(model, {})]
        raise AssertionError(f"unexpected {model}.{method}")

    def write(self, model, ids, vals, context=None): return self.execute(model, "write", ids, vals)
    def create(self, model, vals, context=None): return self.execute(model, "create", vals)

    def ref(self, kind, tid):
        hit = self.xmlids.get(self.key(kind, tid))
        return hit[1] if hit else None

    def stamp(self, kind, tid, model, rid): self.xmlids[self.key(kind, tid)] = (model, rid)

    def upsert(self, kind, tid, model, vals, update=True, context=None):
        existing = self.ref(kind, tid)
        if existing:
            if update and vals:
                self.write(model, [existing], vals)
            return existing, False
        rid = self.execute(model, "create", vals)
        self.stamp(kind, tid, model, rid)
        return rid, True


args = argparse.Namespace(dry_run=False, update=False, checklist_subtasks=True,
                          no_attachments=False, max_attachment_mb=25.0, comments_as_notes=True,
                          include_activity=True, no_custom_fields=False)
odoo = FakeOdoo()
migrate.load_user_map = lambda: {"yusugimoto": "yu@sugimotogroup.org"}
m = Migrator(FakeTrello(), odoo, args)
m.migrate_board("b1")
stats = m.report["b1"]

print("\n--- RESULTS ---")
print("stats:", json.dumps(stats, indent=2, default=list))
tasks = odoo.records["project.task"]
for tid, t in tasks.items():
    print(f"\ntask {tid}: {t.get('name')!r} active={t.get('active')} stage={t.get('stage_id')} "
          f"parent={t.get('parent_id')} state={t.get('state')} deadline={t.get('date_deadline')} "
          f"users={t.get('user_ids')} tags={t.get('tag_ids')}")
print("\ndescription of task 1:\n", tasks[list(tasks)[0]].get("description"))
print("\nmail.message:", odoo.records.get("mail.message"))
print("attachments:", [(v["name"], v.get("mimetype")) for v in odoo.records.get("ir.attachment", {}).values()])

# --- assertions ---
assert stats["tasks_created"] == 2, stats
assert stats["subtasks_created"] == 2
assert stats["comments_created"] == 1
assert stats["attachments_created"] == 1
assert len(stats["attachments_skipped"]) == 1 and stats["attachments_skipped"][0]["mb"] == 900.0
assert "ghost" in stats["unmapped_members"]
top = [t for t in tasks.values() if not t.get("parent_id")]
archived = [t for t in top if t["name"] == "Archived thing"][0]
assert archived["active"] is False
call = [t for t in top if t["name"] == "Call client"][0]
assert call["date_deadline"] == "2026-09-01 16:00:00", call["date_deadline"]
assert call["user_ids"] == [(6, 0, [1])]
assert "Ghost Member" in call["description"]
assert "example.com" in call["description"]
assert "&#9745;" in call["description"] and "&#9744;" in call["description"]
done_sub = [t for t in tasks.values() if t.get("name") == "verify"][0]
assert done_sub["state"] == "1_done"
msg = list(odoo.records["mail.message"].values())[0]
assert msg["author_id"] == 7 and msg["subtype_xmlid"] == "mail.mt_note"
assert msg["date"] == "2026-08-01 10:00:00"

# --- rerun must be a no-op ---
before = len(odoo.records["project.task"])
m2 = Migrator(FakeTrello(), odoo, args)
m2.migrate_board("b1")
s2 = m2.report["b1"]
assert len(odoo.records["project.task"]) == before, "rerun duplicated tasks"
assert (s2["tasks_created"], s2["subtasks_created"], s2["comments_created"],
        s2["attachments_created"]) == (0, 0, 0, 0), s2
print("\nrerun: created nothing new, already present", s2["tasks_existing"], "tasks — idempotent OK")

# --- verify path ---
assert m2.verify_board("b1") is True

# --- custom fields ---
made = odoo.records.get("ir.model.fields", {})
names = sorted(f["name"] for f in made.values())
print("\ncustom fields created:", names)
assert "x_trello_passport_no" in names
assert "x_trello_passport_no_2" in names, "duplicate labels must not collide"
assert not any("weird" in n for n in names), "unsupported types must be skipped"
assert len(made) == 6, made
assert call["x_trello_passport_no"] == "W310078746"
assert call["x_trello_1st_prog_deadline"] == "2026-09-30"
assert call["x_trello_spouse_age"] == 34.0
assert call["x_trello_priority"] == "High"
assert call["x_trello_2nd_payment_ok"] is True
assert "W310078746" in call["description"] and "Spouse Age" in call["description"]
view = list(odoo.records.get("ir.ui.view", {}).values())[0]
assert "Trello data" in view["arch_db"] and "x_trello_priority" in view["arch_db"]
print("form view arch:", view["arch_db"][:120], "...")

# --- RTL ---
assert call["description"].startswith('<div dir="auto">'), call["description"][:60]
assert "\u0627\u06cc\u0645\u06cc\u0644" in call["description"], "Farsi text must survive"
print("Farsi + dir=auto OK")


# --- activity history ---
assert stats["activity_created"] == 2, stats
notes = [m["body"] for m in odoo.records["mail.message"].values()]
moved = [n for n in notes if "moved this card" in n]
assert moved and "Settled JR files" in moved[0] and "Request Letter Received" in moved[0]
print("history note:", moved[0])
assert s2["activity_created"] == 0, "history must not duplicate on rerun"

print("\nALL ASSERTIONS PASSED")
