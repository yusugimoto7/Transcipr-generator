// Assembles the unified draw-notifier workflow JSON from the code-node sources.
// Run: node workflows/build.js  ->  workflows/unified-draw-notifier.workflow.json
const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');
const read = (f) => fs.readFileSync(path.join(srcDir, f), 'utf8');

const jsBuildEE = read('buildEE.js');
const jsBuildBCPNP = read('buildBCPNP.js');
const jsBuildOINP = read('buildOINP.js');
const jsBuildStory = read('buildStory.js');
const jsPrepareImage = read('prepareImage.js');

// Shared constants pulled from the two existing flows.
const EE_URL = 'https://script.google.com/macros/s/AKfycbw1PZkjKloQc2ghagiP0bVTuWI26VQMnNDuUUQhEupXMLNrHx3mZVbGTvTDtOcovdLKng/exec';
const ROUTER = 'https://script.google.com/macros/s/AKfycbxeZy2Je_c5Xjurda1eobhGnheu1lKrfyevnSvWCG7b7I2quDBbTYBqyphG-0ZXc-nS/exec';
const IG_ID = '26846240431664402';
const IG_TOKEN = 'IGAAMJ0hz98q5BZAFl4MnR1ellSREdRVkExV3JZAUkJNTjhrRFZAJRFZAmLVpIUXJFZAnc0WGNVcWZA6c3YyZA0M1eEdzWFNiUWw0a05FandFUXdIdFBDYWM3UEtYT3NLSjQ2cGtCbnJDWS16cmFocG9uWjJLUEZAkRUFFNTJmV0dxRXNvMAZDZD';
const DT_ID = 'CkCfML6nrTQJN7Aw';
const DT_PROJECT = 'L4LTA9nUncOoPxVP';
const TG_CHANNEL = '-1001345603472';

const dtRef = {
  __rl: true, value: DT_ID, mode: 'list',
  cachedResultName: 'posted_draws',
  cachedResultUrl: '/projects/' + DT_PROJECT + '/datatables/' + DT_ID
};
const httpJsonOpts = { response: { response: { responseFormat: 'json' } }, timeout: 20000 };

const nodes = [];
const push = (n) => { nodes.push(n); return n.name; };

push({
  parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 15 }] } },
  type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1.3,
  position: [-1600, 320], id: 'trg-schedule', name: 'Every 15 min'
});

// ---- Fetch branches ----
push({ parameters: { url: EE_URL, options: httpJsonOpts }, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.4, position: [-1360, 80], id: 'http-ee', name: 'Fetch Express Entry', alwaysOutputData: true });
push({ parameters: { url: ROUTER + '?source=bcpnp', options: httpJsonOpts }, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.4, position: [-1360, 320], id: 'http-bcpnp', name: 'Fetch BC PNP', alwaysOutputData: true });
push({ parameters: { url: ROUTER + '?source=oinp', options: httpJsonOpts }, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.4, position: [-1360, 560], id: 'http-oinp', name: 'Fetch OINP', alwaysOutputData: true });

// ---- Build (normalise) ----
push({ parameters: { jsCode: jsBuildEE }, type: 'n8n-nodes-base.code', typeVersion: 2, position: [-1120, 80], id: 'code-ee', name: 'Build EE Items' });
push({ parameters: { jsCode: jsBuildBCPNP }, type: 'n8n-nodes-base.code', typeVersion: 2, position: [-1120, 320], id: 'code-bcpnp', name: 'Build BC PNP Items' });
push({ parameters: { jsCode: jsBuildOINP }, type: 'n8n-nodes-base.code', typeVersion: 2, position: [-1120, 560], id: 'code-oinp', name: 'Build OINP Items' });

// ---- Merge (3 inputs, append) ----
push({ parameters: { mode: 'append', numberInputs: 3 }, type: 'n8n-nodes-base.merge', typeVersion: 3.2, position: [-880, 320], id: 'merge-all', name: 'Merge All Programs' });

// ---- Build story card (svg + passthrough) ----
push({ parameters: { jsCode: jsBuildStory }, type: 'n8n-nodes-base.code', typeVersion: 2, position: [-640, 320], id: 'code-story', name: 'Build Story Card' });

// ---- Dedup lookup + gate ----
push({
  parameters: { operation: 'get', dataTableId: dtRef, filters: { conditions: [{ keyName: 'draw_number', keyValue: '={{ $json.dedup_key }}' }] }, limit: 1 },
  type: 'n8n-nodes-base.dataTable', typeVersion: 1.1, position: [-400, 320], id: 'dt-check', name: 'Check if posted', alwaysOutputData: true
});
push({
  parameters: {
    conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 3 },
      conditions: [{ id: 'cond-empty', leftValue: '={{ $json.draw_number }}', rightValue: '', operator: { type: 'string', operation: 'empty', singleValue: true } }],
      combinator: 'and' }, options: {}
  },
  type: 'n8n-nodes-base.if', typeVersion: 2.2, position: [-160, 320], id: 'if-new', name: 'Is New?'
});

// ---- Platform posts ----
push({
  parameters: { chatId: TG_CHANNEL, text: "={{ $('Build Story Card').item.json.final_post_text }}", additionalFields: { appendAttribution: false, parse_mode: 'HTML' } },
  type: 'n8n-nodes-base.telegram', typeVersion: 1.2, position: [140, 40], id: 'tg-post', name: 'Post to Telegram Channel', webhookId: 'unified-post-channel',
  credentials: { telegramApi: { id: 'tBkaYSTkkyWvaNl9', name: 'Telegram Notifier bot' } }
});
push({
  parameters: { text: "={{ $('Build Story Card').item.json.x_post_text }}", additionalFields: {} },
  type: 'n8n-nodes-base.twitter', typeVersion: 2, position: [140, 200], id: 'x-post', name: 'Post to X',
  credentials: { twitterOAuth2Api: { id: 'ULB2NMsT0Nkec4Ra', name: 'X account' } }
});
push({
  parameters: { authentication: 'communityManagement', postAs: 'organization', organization: '90406990', text: "={{ $('Build Story Card').item.json.linkedin_text }}", additionalFields: {} },
  type: 'n8n-nodes-base.linkedIn', typeVersion: 1, position: [140, 360], id: 'li-post', name: 'Post to LinkedIn',
  credentials: { linkedInCommunityManagementOAuth2Api: { id: 'wlBq9tA2F8OMqx8H', name: 'Sugimoto Master App' } }
});

// ---- Insert dedup row (off Telegram so it always records, even when IG is skipped) ----
push({
  parameters: {
    dataTableId: dtRef,
    columns: { mappingMode: 'defineBelow', value: {
      draw_number: "={{ $('Build Story Card').item.json.dedup_key }}",
      posted_at: '={{ $now.toISO() }}',
      draw_name: "={{ $('Build Story Card').item.json.dt_name }}",
      draw_crs: "={{ $('Build Story Card').item.json.dt_crs }}",
      draw_size: "={{ $('Build Story Card').item.json.dt_size }}"
    },
      matchingColumns: [], schema: [
        { id: 'draw_number', displayName: 'draw_number', required: false, defaultMatch: false, display: true, type: 'string', readOnly: false, removed: false },
        { id: 'posted_at', displayName: 'posted_at', required: false, defaultMatch: false, display: true, type: 'dateTime', readOnly: false, removed: false },
        { id: 'draw_name', displayName: 'draw_name', required: false, defaultMatch: false, display: true, type: 'string', readOnly: false, removed: false },
        { id: 'draw_crs', displayName: 'draw_crs', required: false, defaultMatch: false, display: true, type: 'string', readOnly: false, removed: false },
        { id: 'draw_size', displayName: 'draw_size', required: false, defaultMatch: false, display: true, type: 'string', readOnly: false, removed: false }
      ], attemptToConvertTypes: false, convertFieldsToString: false }, options: {}
  },
  type: 'n8n-nodes-base.dataTable', typeVersion: 1.1, position: [420, 40], id: 'dt-insert', name: 'Mark as posted'
});

// ---- Instagram story chain ----
push({ parameters: { jsCode: jsPrepareImage }, type: 'n8n-nodes-base.code', typeVersion: 2, position: [140, 560], id: 'code-prepimg', name: 'Prepare Image', executeOnce: false });
push({
  parameters: {
    method: 'POST', url: 'https://hcti.io/v1/image', authentication: 'genericCredentialType', genericAuthType: 'httpBasicAuth', sendBody: true, specifyBody: 'json',
    jsonBody: '={\n  "html": "<div id=\'wrap\'>{{ $json.svg.replace(/\\"/g, \'\\\\"\').replace(/\\n/g, \'\') }}</div>",\n  "css": "body,html{margin:0;padding:0}#wrap{width:1080px;height:1920px}svg{width:100%;height:100%;display:block}",\n  "viewport_width": 1080,\n  "viewport_height": 1920,\n  "device_scale": 1\n}',
    options: {}
  },
  type: 'n8n-nodes-base.httpRequest', typeVersion: 4.4, position: [380, 560], id: 'http-render', name: 'Render SVG to PNG',
  credentials: { httpBasicAuth: { id: 'QzkGK4407SS7p6Q2', name: 'Unnamed credential 2' } }
});
push({
  parameters: { method: 'POST', url: 'https://graph.instagram.com/v21.0/' + IG_ID + '/media', sendBody: true, specifyBody: 'json',
    jsonBody: '={\n  "image_url": "{{ $json.url }}",\n  "media_type": "STORIES",\n  "access_token": "' + IG_TOKEN + '"\n}', options: {} },
  type: 'n8n-nodes-base.httpRequest', typeVersion: 4.4, position: [620, 560], id: 'http-igcontainer', name: 'Create IG Story Container'
});
push({ parameters: { amount: 10 }, type: 'n8n-nodes-base.wait', typeVersion: 1.1, position: [820, 560], id: 'wait-ig', name: 'Wait', webhookId: 'unified-ig-wait' });
push({
  parameters: { method: 'POST', url: 'https://graph.instagram.com/v21.0/' + IG_ID + '/media_publish', sendBody: true, specifyBody: 'json',
    jsonBody: '={\n  "creation_id": "{{ $(\'Create IG Story Container\').item.json.id }}",\n  "access_token": "' + IG_TOKEN + '"\n}', options: {} },
  type: 'n8n-nodes-base.httpRequest', typeVersion: 4.4, position: [1020, 560], id: 'http-igpublish', name: 'Publish IG Story'
});

// ---- Sticky note ----
nodes.push({
  parameters: { content: '## Unified Draw Notifier (EE + OINP + BC PNP)\n\nRuns every 15 min. Fetches all three programs, normalises them, dedups against the `posted_draws` data table, then auto-posts to Telegram, X, LinkedIn, and Instagram (story image).\n\n**Before enabling:** paste your logo base64 into the `LOGO_B64` constant in **Build Story Card**, and DEACTIVATE the old EE and BC PNP/OINP flows to avoid double posting.', height: 260, width: 460, color: 4 },
  type: 'n8n-nodes-base.stickyNote', typeVersion: 1, position: [-1600, -40], id: 'sticky-doc', name: 'About'
});

const conn = (from, to, toIndex = 0, fromIndex = 0) => ({ from, to, toIndex, fromIndex });
const links = [
  conn('Every 15 min', 'Fetch Express Entry'),
  conn('Every 15 min', 'Fetch BC PNP'),
  conn('Every 15 min', 'Fetch OINP'),
  conn('Fetch Express Entry', 'Build EE Items'),
  conn('Fetch BC PNP', 'Build BC PNP Items'),
  conn('Fetch OINP', 'Build OINP Items'),
  conn('Build EE Items', 'Merge All Programs', 0),
  conn('Build BC PNP Items', 'Merge All Programs', 1),
  conn('Build OINP Items', 'Merge All Programs', 2),
  conn('Merge All Programs', 'Build Story Card'),
  conn('Build Story Card', 'Check if posted'),
  conn('Check if posted', 'Is New?'),
  // Is New? true output (index 0) fans out to all posts
  conn('Is New?', 'Post to Telegram Channel'),
  conn('Is New?', 'Post to X'),
  conn('Is New?', 'Post to LinkedIn'),
  conn('Is New?', 'Prepare Image'),
  conn('Post to Telegram Channel', 'Mark as posted'),
  conn('Prepare Image', 'Render SVG to PNG'),
  conn('Render SVG to PNG', 'Create IG Story Container'),
  conn('Create IG Story Container', 'Wait'),
  conn('Wait', 'Publish IG Story')
];

const connections = {};
for (const l of links) {
  connections[l.from] = connections[l.from] || { main: [] };
  const arr = connections[l.from].main;
  while (arr.length <= l.fromIndex) arr.push([]);
  arr[l.fromIndex].push({ node: l.to, type: 'main', index: l.toIndex });
}

const workflow = {
  name: 'Unified Draw Notifier (EE + OINP + BC PNP)',
  nodes,
  connections,
  settings: { executionOrder: 'v1' },
  pinData: {},
  meta: { instanceId: '31ed0674f1ed845475d221b96825475281c82d13bb39ee736e0f814d52e165b9' }
};

const out = path.join(__dirname, 'unified-draw-notifier.workflow.json');
fs.writeFileSync(out, JSON.stringify(workflow, null, 2));
console.log('Wrote ' + out + ' (' + nodes.length + ' nodes, ' + links.length + ' connections)');
