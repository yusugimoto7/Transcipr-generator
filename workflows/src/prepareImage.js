// Code node: "Prepare Image" — runs once per item.
// Skips program updates (no story image); otherwise base64-encodes the SVG for
// the HCTI render step. References Build Story Card via paired item.
const j = $('Build Story Card').item.json;
if (j.skipInstagram || !j.svg) return [];
const svgBase64 = Buffer.from(j.svg).toString('base64');
return [{
  json: Object.assign({}, j, {
    svgBase64: svgBase64,
    dataUri: 'data:image/svg+xml;base64,' + svgBase64
  })
}];
