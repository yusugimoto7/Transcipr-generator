"""Contract column on quotations: Not sent / Draft sent / Contract sent / Signed /
Signed and paid ..., instead of Odoo's own Quotation / Sales Order status.

Send Contract and Send Manually set "Contract sent"; Accept Signed Contract
sets "Signed"; after that each quotation follows its CRM card's contract
status (the card-rules dispatcher copies it), e.g. "Signed and paid" when the
card reaches a payment stage.

Run:  PYTHONPATH=. python contract_state.py
"""
import logging
import os

from dotenv import load_dotenv

from odoo_client import Odoo
from sign_contracts import _field

log = logging.getLogger(__name__)

STATES = [("not_sent", "Not sent"), ("draft_sent", "Draft sent"), ("sent", "Contract sent"), ("signed", "Signed"),
          ("signed_partial", "Signed, partially paid"), ("paid", "Signed and paid"), ("paid_only", "Paid, not signed"),
          ("terminated", "Terminated"), ("other", "Other")]
BADGE = ('widget="badge" decoration-muted="x_contract_state == \'not_sent\'" '
         'decoration-info="x_contract_state in (\'draft_sent\', \'sent\')" '
         'decoration-warning="x_contract_state in (\'signed\', \'signed_partial\', \'paid_only\')" '
         'decoration-success="x_contract_state == \'paid\'" decoration-danger="x_contract_state == \'terminated\'"')


def install(odoo):
    _field(odoo, "sale.order", "x_contract_state", {
        "field_description": "Contract", "ttype": "selection", "copied": False,
        "selection_ids": [(0, 0, {"value": v, "name": n, "sequence": i}) for i, (v, n) in enumerate(STATES)]})
    fid = odoo.search_read("ir.model.fields", [("model", "=", "sale.order"), ("name", "=", "x_contract_state")], ["id"])[0]["id"]
    if not odoo.search_read("ir.default", [("field_id", "=", fid)], ["id"]):
        odoo.create("ir.default", {"field_id": fid, "json_value": '"not_sent"'})

    # Existing quotations: sent ones take their card's status, the rest "Not sent".
    orders = odoo.search_read("sale.order", [("x_contract_state", "=", False)],
                              ["id", "state", "x_sheet_sent_date", "x_manual_sent", "x_sign_request_id",
                               "x_signed_accepted_on", "opportunity_id"])
    cards = {c["id"]: c["x_contract_status"] for c in odoo.search_read(
        "crm.lead", [("id", "in", list({o["opportunity_id"][0] for o in orders if o["opportunity_id"]}))],
        ["x_contract_status"], context={"active_test": False})}
    groups = {}
    for o in orders:
        out = o["x_sheet_sent_date"] or o["x_manual_sent"] or o["x_sign_request_id"] or o["x_signed_accepted_on"]
        st = "not_sent"
        if out:
            st = (cards.get(o["opportunity_id"][0]) if o["opportunity_id"] else None) or (
                "signed" if o["x_signed_accepted_on"] else "sent")
        groups.setdefault(st, []).append(o["id"])
    for st, ids in groups.items():
        odoo.write("sale.order", ids, {"x_contract_state": st})
    log.info("  contract column filled: %s", {k: len(v) for k, v in groups.items()})

    def ref_id(xmlid):
        m, n = xmlid.split(".")
        return odoo.search_read("ir.model.data", [("module", "=", m), ("name", "=", n)], ["res_id"])[0]["res_id"]
    # Quotations list: the Contract column in place of Odoo's Status.
    odoo.upsert("p2view", "quote_list_contract", "ir.ui.view", {
        "name": "sale.order.tree.contract", "model": "sale.order", "inherit_id": ref_id("sale.view_quotation_tree"),
        "priority": 200,
        "arch_db": ('<data><xpath expr="//field[@name=\'state\']" position="before">'
                    '<field name="x_contract_state" %s optional="show"/></xpath>'
                    '<xpath expr="//field[@name=\'state\']" position="attributes">'
                    '<attribute name="optional">hide</attribute></xpath></data>') % BADGE})
    # Quotation form: the badge under the number.
    odoo.upsert("p2view", "quote_form_contract", "ir.ui.view", {
        "name": "sale.order.form.contract", "model": "sale.order", "inherit_id": ref_id("sale.view_order_form"),
        "priority": 200,
        "arch_db": ('<data><xpath expr="//div[hasclass(\'oe_title\')]" position="inside">'
                    '<field name="x_contract_state" %s readonly="1"/></xpath></data>') % BADGE})
    log.info("  Contract column on the quotation list and form")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    load_dotenv(".env")
    o = Odoo(os.environ["ODOO_URL"], os.environ["ODOO_DB"], os.environ["ODOO_USERNAME"], os.environ["ODOO_PASSWORD"])
    o.login()
    install(o)
