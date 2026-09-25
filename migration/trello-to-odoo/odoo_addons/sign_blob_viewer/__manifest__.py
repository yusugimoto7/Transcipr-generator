{
    "name": "Sign: download-manager safe viewer",
    "version": "17.0.1.0.0",
    "summary": "Loads the document on the signing page without a PDF download, "
               "so browser download managers (IDM and the like) cannot intercept it.",
    "category": "Sales/Sign",
    "author": "Sugimoto Group",
    "license": "LGPL-3",
    "depends": ["sign"],
    "assets": {
        "sign.assets_public_sign": [
            "sign_blob_viewer/static/src/document_blob.js",
        ],
    },
    "installable": True,
    "application": False,
}
