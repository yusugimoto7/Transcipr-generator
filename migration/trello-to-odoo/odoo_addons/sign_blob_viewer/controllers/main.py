import base64
import logging

from odoo import http

from odoo.addons.sign.controllers import main as sign_main

_logger = logging.getLogger(__name__)


def _sign_download_endpoint():
    """Odoo Sign's own /sign/download/<id>/<token>/<type> handler, as (class, function).

    Found by its route rather than by class or method name, so a renamed
    method in a later Sign release does not silently break this module.
    """
    for cls in vars(sign_main).values():
        if not (isinstance(cls, type) and issubclass(cls, http.Controller)):
            continue
        for name in dir(cls):
            fn = getattr(cls, name, None)
            routing = getattr(fn, "original_routing", None) or getattr(fn, "routing", None)
            if isinstance(routing, dict) and any(
                    r.startswith("/sign/download/") for r in routing.get("routes") or []):
                return cls, getattr(fn, "original_endpoint", fn)
    return None, None


class SignBlobViewer(http.Controller):

    @http.route("/sign/pdf_bytes/<int:id>/<token>/<download_type>", type="json", auth="public")
    def pdf_bytes(self, id, token, download_type="origin", **kwargs):
        # The very response Odoo Sign would stream to the PDF viewer, with its
        # access checks, handed back inside JSON: a download manager watches
        # for application/pdf responses and leaves JSON alone.
        controller, endpoint = _sign_download_endpoint()
        if endpoint is None:
            _logger.warning("sign_blob_viewer: no /sign/download route found in Sign")
            return {}
        try:
            response = endpoint(controller(), id, token, download_type)
        except Exception:
            _logger.info("sign_blob_viewer: document %s not available", id, exc_info=True)
            return {}
        try:
            data = response.get_data()
        except RuntimeError:
            # streamed from the filestore (direct passthrough)
            data = b"".join(response.response)
        if not data or not data.startswith(b"%PDF"):
            return {}
        return {"data": base64.b64encode(data).decode()}
