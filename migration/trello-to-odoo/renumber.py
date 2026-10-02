"""Change contract no. – a button on the CRM card to correct a client's
contract number and/or name by hand.

The card, the customer, every live quotation of the card and the finance
sheet row follow: the quotation is marked for the sheet job again with the
old number kept in x_sheet_old_no, so n8n rewrites the existing row instead
of adding a new one.

Run:  PYTHONPATH=. python renumber.py
"""
import logging
import os

from dotenv import load_dotenv

from odoo_client import Odoo
from sign_contracts import _field, _model_id, _server_action

log = logging.getLogger(__name__)

WIZ = "x_contract_renumber"

OPEN_CODE = r"""
lead = record
FILE_PREFIXES = ('S', 'SB', 'SG', 'SBSUV', 'SGSUV', 'SBEU', 'SBBICT', 'SGBICT', 'C')
def file_no(v):
    v = (v or '').strip().upper()
    head = v.rstrip('0123456789')
    return v if head in FILE_PREFIXES and 4 <= len(v) - len(head) <= 9 else ''
name = (lead.name or '').strip()
head = name.split(' - ')[0].strip()
number = file_no(head)
client = name[len(head):].lstrip(' -').strip() if number else name
if not number:
    o = lead.order_ids.filtered(lambda o: o.state != 'cancel' and file_no(o.client_order_ref))[:1]
    number = o.client_order_ref if o else ''
wiz = env['x_contract_renumber'].create({'x_lead_id': lead.id, 'x_old_no': number, 'x_number': number, 'x_client': client})
action = {'type': 'ir.actions.act_window', 'name': 'Change contract no.', 'res_model': 'x_contract_renumber',
          'res_id': wiz.id, 'view_mode': 'form', 'target': 'new'}
""".strip()

APPLY_CODE = r"""
FILE_PREFIXES = ('S', 'SB', 'SG', 'SBSUV', 'SGSUV', 'SBEU', 'SBBICT', 'SGBICT', 'C')
def file_no(v):
    v = (v or '').strip().upper()
    head = v.rstrip('0123456789')
    return v if head in FILE_PREFIXES and 4 <= len(v) - len(head) <= 9 else ''
w = record
lead = w.x_lead_id
old = (w.x_old_no or '').strip().upper()
new = file_no(w.x_number)
client = (w.x_client or '').strip()
if not new:
    raise UserError("'%s' is not a contract number (for example S26291 or SB000026127)." % (w.x_number or ''))
if not client:
    raise UserError("Enter the client's name.")
Lead = env['crm.lead'].sudo().with_context(active_test=False)
Order = env['sale.order'].sudo()
if new != old:
    other = Lead.search(['&', ('id', '!=', lead.id), '|', '|', ('name', '=like', new + ' %'),
                         ('x_contract_no_sg', '=', new), ('x_contract_no_sb', '=', new)], limit=1)
    if not other:
        so = Order.search([('opportunity_id', '!=', lead.id), ('state', '!=', 'cancel'),
                           '|', ('client_order_ref', '=', new), ('x_sugimoto_no', '=', new)], limit=1)
        other = so.opportunity_id if so else False
    if other:
        raise UserError("%s is already used by the card \"%s\"." % (new, other.name))
label = '%s - %s' % (new, client)
lead.sudo().write({'name': label})
if lead.partner_id and file_no((lead.partner_id.name or '').split(' - ')[0]):
    lead.partner_id.sudo().write({'name': label})
vals = {}
if 'x_contract_no_sg' in lead._fields:
    if old and lead.x_contract_no_sg == old:
        vals['x_contract_no_sg'] = new
    if old and lead.x_contract_no_sb == old:
        vals['x_contract_no_sb'] = new
if vals:
    lead.sudo().write(vals)
names = client.rsplit(' ', 1)
first = names[0] if len(names) > 1 else client
family = names[1] if len(names) > 1 else ''
touched = []
for o in lead.order_ids.filtered(lambda o: o.state != 'cancel'):
    ov = {}
    main_hit = (o.client_order_ref or '').strip().upper() == old or not old
    sug_hit = old and (o.x_sugimoto_no or '').strip().upper() == old
    if main_hit:
        ov['client_order_ref'] = new
    if sug_hit:
        ov['x_sugimoto_no'] = new
    synced = o.x_sheet_synced and o.x_sheet_synced != 'pending'
    if (main_hit or sug_hit or client) and o.x_sheet_contract_no:
        if main_hit:
            ov['x_sheet_contract_no'] = new
            if synced and old and old != new and not o.x_sheet_old_no:
                ov['x_sheet_old_no'] = old
        if sug_hit and synced and old != new and not o.x_sug_old_no:
            ov['x_sug_old_no'] = old
        ov.update({'x_sheet_display': '%s - %s' % ((ov.get('client_order_ref') or o.client_order_ref), client),
                   'x_sheet_name': first, 'x_sheet_family': family, 'x_sheet_rename': True,
                   'x_sheet_status_only': False})
        if synced:
            ov['x_sheet_synced'] = 'pending'
    if ov:
        o.sudo().write(ov)
        touched.append(o.name)
lead.sudo().message_post(
    body='Contract number / name changed by %s: %s → %s (%s). Quotations updated: %s. The finance sheet row follows within 10 minutes.'
         % (env.user.name, old or '—', new, client, ', '.join(touched) or 'none'),
    message_type='comment', subtype_xmlid='mail.mt_note')
action = {'type': 'ir.actions.client', 'tag': 'reload'}
""".strip()


def install(odoo):
    model_id = odoo.ref("p2model", "contract_renumber")
    if not model_id:
        have = odoo.search_read("ir.model", [("model", "=", WIZ)], ["id"], limit=1)
        if have:
            model_id = have[0]["id"]
            odoo.stamp("p2model", "contract_renumber", "ir.model", model_id)
        else:
            model_id, _ = odoo.upsert("p2model", "contract_renumber", "ir.model", {
                "name": "Change contract no.", "model": WIZ, "state": "manual", "transient": True}, update=False)
    _field(odoo, WIZ, "x_lead_id", {"field_description": "Card", "ttype": "many2one", "relation": "crm.lead",
                                    "required": True, "on_delete": "cascade"})
    _field(odoo, WIZ, "x_old_no", {"field_description": "Current number", "ttype": "char"})
    _field(odoo, WIZ, "x_number", {"field_description": "Contract no.", "ttype": "char", "required": True})
    _field(odoo, WIZ, "x_client", {"field_description": "Client name", "ttype": "char", "required": True})
    # The finance-sheet job finds the existing row by the old number.
    for name, label in (("x_sheet_old_no", "Sheet: previous contract no"),
                        ("x_sug_old_no", "Sheet: previous Sugimoto no (pair)")):
        _field(odoo, "sale.order", name, {"field_description": label, "ttype": "char", "copied": False})
    _field(odoo, "sale.order", "x_sheet_rename", {"field_description": "Sheet: only number/name changed",
                                                  "ttype": "boolean", "copied": False})
    group = odoo.search_read("ir.model.data", [("module", "=", "base"), ("name", "=", "group_user")], ["res_id"], limit=1)[0]["res_id"]
    acc = {"name": "x_contract_renumber.user", "model_id": model_id, "group_id": group,
           "perm_read": True, "perm_write": True, "perm_create": True, "perm_unlink": True}
    odoo.upsert("p2access", "contract_renumber", "ir.model.access", acc)

    apply_id = _server_action(odoo, "contract_renumber_apply", {
        "name": "Save contract no.", "model_id": model_id, "state": "code", "code": APPLY_CODE,
        "binding_model_id": False})
    arch = ('<form>'
            '<field name="x_lead_id" invisible="1"/><field name="x_old_no" invisible="1"/>'
            '<group>'
            '<field name="x_number" placeholder="S26291"/>'
            '<field name="x_client" placeholder="First and last name (English)"/>'
            '</group>'
            '<p class="text-muted">The card, the customer, the quotations and the finance sheet row '
            'all take the new number and name. A contract already sent keeps the old number on its PDF; '
            'press Resend Contract on the quotation to send it with the new one.</p>'
            '<footer>'
            '<button name="%d" type="action" string="Save" class="btn-primary"/>'
            '<button string="Cancel" class="btn-secondary" special="cancel"/>'
            '</footer></form>') % apply_id
    odoo.upsert("p2view", "contract_renumber", "ir.ui.view", {
        "name": "contract.renumber.wizard", "model": WIZ, "type": "form", "arch_db": arch, "priority": 16})
    open_id = _server_action(odoo, "contract_renumber_open", {
        "name": "Change contract no.", "model_id": _model_id(odoo, "crm.lead"), "state": "code",
        "code": OPEN_CODE, "binding_model_id": False})
    base = odoo.search_read("ir.ui.view", [("model", "=", "crm.lead"), ("type", "=", "form"),
                                           ("inherit_id", "=", False), ("name", "=", "crm.lead.form")], ["id"], limit=1)[0]["id"]
    odoo.upsert("p2view", "lead_renumber_button", "ir.ui.view", {
        "name": "crm.lead.form.renumber", "model": "crm.lead", "inherit_id": base, "priority": 220,
        "arch_db": ('<data><xpath expr="//header" position="inside">'
                    '<button name="%d" type="action" string="Change contract no." invisible="type == \'lead\'"/>'
                    '</xpath></data>') % open_id})
    log.info("  Change contract no. button on the CRM card")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    load_dotenv(".env")
    o = Odoo(os.environ["ODOO_URL"], os.environ["ODOO_DB"], os.environ["ODOO_USERNAME"], os.environ["ODOO_PASSWORD"])
    o.login()
    install(o)
