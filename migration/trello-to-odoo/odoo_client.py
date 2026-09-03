"""Odoo XML-RPC client with external-id bookkeeping.

Every record this migration creates is stamped with an ``ir.model.data``
external id under the ``__trello__`` module, keyed by the Trello object id.
That is what makes reruns idempotent: the mapping lives in Odoo itself, so the
migration can be resumed from any machine, and a local state file is never the
source of truth.
"""

import logging
import xmlrpc.client

import requests

log = logging.getLogger(__name__)


class _RequestsTransport(xmlrpc.client.Transport):
    """XML-RPC over requests, so HTTPS_PROXY / REQUESTS_CA_BUNDLE apply.

    The stdlib transport opens sockets directly and ignores proxy settings,
    which fails inside sandboxes that only allow egress through a proxy.
    """

    def __init__(self):
        super().__init__()
        self.session = requests.Session()

    def request(self, host, handler, request_body, verbose=False):
        scheme = "https" if isinstance(self, xmlrpc.client.SafeTransport) else "http"
        response = self.session.post(
            f"{scheme}://{host}{handler}", data=request_body,
            headers={"Content-Type": "text/xml"}, timeout=600,
        )
        if response.status_code != 200:
            raise xmlrpc.client.ProtocolError(
                host + handler, response.status_code, response.reason, response.headers)
        parser, unmarshaller = self.getparser()
        parser.feed(response.content)
        parser.close()
        return unmarshaller.close()


class _RequestsSafeTransport(_RequestsTransport, xmlrpc.client.SafeTransport):
    pass


def server_proxy(url):
    transport = _RequestsSafeTransport() if url.startswith("https") else _RequestsTransport()
    return xmlrpc.client.ServerProxy(url, allow_none=True, transport=transport)

MODULE = "__trello__"


class OdooError(RuntimeError):
    pass


class Odoo:
    def __init__(self, url, db, username, password):
        for name, value in (("ODOO_URL", url), ("ODOO_DB", db),
                            ("ODOO_USERNAME", username), ("ODOO_PASSWORD", password)):
            if not value:
                raise OdooError(f"{name} must be set.")
        self.url = url.rstrip("/")
        self.db = db
        self.username = username
        self.password = password
        self.common = server_proxy(f"{self.url}/xmlrpc/2/common")
        self.models = server_proxy(f"{self.url}/xmlrpc/2/object")
        self.uid = None
        self._field_cache = {}
        self._refs = None  # name -> res_id, filled by preload()

    # -- plumbing ----------------------------------------------------------

    def login(self):
        try:
            self.uid = self.common.authenticate(self.db, self.username, self.password, {})
        except xmlrpc.client.Fault as exc:
            raise OdooError(f"Odoo login failed: {exc.faultString}") from exc
        if not self.uid:
            raise OdooError(
                "Odoo rejected the credentials. Check ODOO_DB (run `probe`), "
                "ODOO_USERNAME and ODOO_PASSWORD/API key."
            )
        log.info("Logged into %s (db=%s) as uid %s", self.url, self.db, self.uid)
        return self.uid

    def version(self):
        return self.common.version()

    def execute(self, model, method, *args, **kwargs):
        if self.uid is None:
            self.login()
        try:
            return self.models.execute_kw(
                self.db, self.uid, self.password, model, method, list(args), kwargs
            )
        except xmlrpc.client.Fault as exc:
            raise OdooError(f"{model}.{method} failed: {exc.faultString}") from exc

    def search_read(self, model, domain, fields, **kwargs):
        return self.execute(model, "search_read", domain, fields=fields, **kwargs)

    def create(self, model, vals, context=None):
        ctx = dict(self.write_context(), **(context or {}))
        return self.execute(model, "create", vals, context=ctx)

    def write(self, model, ids, vals, context=None):
        ctx = dict(self.write_context(), **(context or {}))
        return self.execute(model, "write", ids, vals, context=ctx)

    def write_context(self):
        """Keep the migration quiet: no tracking messages, no notification mail."""
        return {
            "tracking_disable": True,
            "mail_create_nolog": True,
            "mail_create_nosubscribe": True,
            "mail_notrack": True,
            "mail_auto_subscribe_no_notify": True,
        }

    def fields(self, model):
        if model not in self._field_cache:
            self._field_cache[model] = self.execute(
                model, "fields_get", [], attributes=["type", "string", "required", "selection"]
            )
        return self._field_cache[model]

    def has_field(self, model, field):
        return field in self.fields(model)

    def field_type(self, model, field):
        return (self.fields(model).get(field) or {}).get("type")

    # -- external ids ------------------------------------------------------

    @staticmethod
    def key(kind, trello_id):
        return f"{kind}_{trello_id}"

    def preload(self):
        """Load every external id this migration has created, in one pass.

        Without this, each card costs an ir.model.data round trip just to ask
        "have I migrated you already?" — on boards of several hundred cards
        that dominates the runtime.
        """
        rows = self.search_read(
            "ir.model.data", [("module", "=", MODULE)], ["name", "model", "res_id"]
        )
        by_model = {}
        for row in rows:
            by_model.setdefault(row["model"], []).append(row)

        self._refs = {}
        stale = 0
        for model, items in by_model.items():
            # A record may have been deleted in Odoo since it was migrated;
            # check per model rather than per record.
            try:
                alive = set(self.execute(model, "exists", [i["res_id"] for i in items]))
            except OdooError:
                alive = {i["res_id"] for i in items}
            for item in items:
                if item["res_id"] in alive:
                    self._refs[item["name"]] = item["res_id"]
                else:
                    stale += 1
        log.info("Loaded %d previously migrated records%s",
                 len(self._refs), f" ({stale} since deleted in Odoo)" if stale else "")
        return self._refs

    def ref(self, kind, trello_id):
        """Odoo id previously created for this Trello object, or None."""
        name = self.key(kind, trello_id)
        if self._refs is not None:
            return self._refs.get(name)
        rows = self.search_read(
            "ir.model.data",
            [("module", "=", MODULE), ("name", "=", name)],
            ["res_id", "model"],
            limit=1,
        )
        if not rows:
            return None
        row = rows[0]
        # The record may have been deleted in Odoo since the last run.
        if not self.execute(row["model"], "exists", [row["res_id"]]):
            self.execute("ir.model.data", "unlink", [r["id"] for r in rows])
            return None
        return row["res_id"]

    def stamp(self, kind, trello_id, model, res_id):
        if self._refs is not None:
            self._refs[self.key(kind, trello_id)] = res_id
        self.execute(
            "ir.model.data",
            "create",
            {
                "module": MODULE,
                "name": self.key(kind, trello_id),
                "model": model,
                "res_id": res_id,
                "noupdate": True,
            },
        )

    def upsert(self, kind, trello_id, model, vals, update=True, context=None):
        """Create the record on first run; on later runs reuse and refresh it.

        Returns (odoo_id, created).
        """
        existing = self.ref(kind, trello_id)
        if existing:
            if update and vals:
                self.write(model, [existing], vals, context=context)
            return existing, False
        new_id = self.execute(
            model, "create", vals, context=dict(self.write_context(), **(context or {}))
        )
        self.stamp(kind, trello_id, model, new_id)
        return new_id, True
