/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { Document } from "@sign/components/sign_request/document_signable";
import { buildPDFViewerURL } from "@sign/components/sign_request/utils";

// Odoo Sign points its PDF viewer at /sign/download/..., and the viewer fetches
// that as application/pdf, which browser download managers (IDM) grab before
// the page ever sees it: "Need a valid PDF to add signature fields!". Here the
// same bytes arrive inside a JSON reply and are handed to the viewer as an
// in-memory blob: URL, which no download manager can intercept. Any failure
// falls back to Odoo's own URL, so the page is never worse off than before.
patch(Document.prototype, {
    getDataFromHTML() {
        const frame = this.props.parent.querySelector("iframe.o_sign_pdf_iframe");
        const input = this.props.parent.querySelector("#o_sign_input_attachment_location");
        const location = input && input.value;
        const match = location && location.match(/^\/sign\/download\/(\d+)\/([^/]+)\/([^/?#]+)/);
        if (!frame || !match) {
            return super.getDataFromHTML(...arguments);
        }
        // Hold back the viewer URL Odoo sets, so nothing is fetched as a PDF.
        let heldSrc = null;
        const setAttribute = frame.setAttribute;
        frame.setAttribute = function (name, value) {
            if (name === "src") {
                heldSrc = value;
                return;
            }
            return setAttribute.call(this, name, value);
        };
        try {
            super.getDataFromHTML(...arguments);
        } finally {
            delete frame.setAttribute;
        }
        const release = (src) => src && frame.setAttribute("src", src);
        this.rpc(`/sign/pdf_bytes/${match[1]}/${match[2]}/${match[3]}`, {})
            .then((result) => {
                if (!result || !result.data) {
                    return release(heldSrc);
                }
                const binary = atob(result.data);
                const bytes = new Uint8Array(binary.length);
                for (let i = 0; i < binary.length; i++) {
                    bytes[i] = binary.charCodeAt(i);
                }
                const blobUrl = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
                release(buildPDFViewerURL(blobUrl, this.env.isSmall));
            })
            .catch(() => release(heldSrc));
    },
});
