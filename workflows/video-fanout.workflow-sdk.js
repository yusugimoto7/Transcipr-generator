import { workflow, node, trigger, sticky, newCredential, merge, ifElse } from '@n8n/workflow-sdk';

const videoForm = trigger({
  type: 'n8n-nodes-base.formTrigger',
  version: 2.5,
  config: {
    name: 'Video upload form',
    position: [240, 400],
    parameters: {
      formTitle: 'Sugimoto Video Fan-out',
      formDescription: 'Drop one video. It posts to Instagram, Facebook, YouTube and TikTok.',
      formFields: {
        values: [
          { fieldType: 'file', fieldLabel: 'Video', multipleFiles: false, acceptFileTypes: '.mp4,.mov', requiredField: true },
          { fieldType: 'textarea', fieldLabel: 'Caption', requiredField: true, placeholder: 'Caption for all platforms' },
          { fieldType: 'text', fieldLabel: 'YouTube title', requiredField: false, placeholder: 'Optional - falls back to the caption' },
          { fieldType: 'checkbox', fieldLabel: 'Platforms',
            fieldOptions: { values: [ { option: 'Instagram' }, { option: 'Facebook' }, { option: 'YouTube' }, { option: 'TikTok' } ] },
            defaultValue: 'Instagram, Facebook, YouTube, TikTok' },
        ],
      },
      responseMode: 'onReceived',
      options: { buttonLabel: 'Publish', path: 'video-fanout', appendAttribution: false },
    },
  },
  output: [{ Caption: 'my caption', Platforms: ['Instagram'] }],
});

// The form names its binary field after the label; normalise it to `data` so
// every downstream node can reference it without guessing.
const normalizeBinary = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Normalize video binary',
    position: [440, 400],
    parameters: {
      jsCode: `const item = $input.first();
const bin = item.binary || {};
const key = Object.keys(bin)[0];
if (!key) { throw new Error('No video file was received from the form.'); }
return [{ json: item.json, binary: { data: bin[key] } }];`,
    },
  },
  output: [{ Caption: 'my caption' }],
});

const wpUpload = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Host video on WordPress',
    position: [660, 400],
    parameters: {
      method: 'POST',
      url: 'https://sugimotovisa.com/wp-json/wp/v2/media',
      authentication: 'genericCredentialType',
      genericAuthType: 'httpBasicAuth',
      sendHeaders: true,
      specifyHeaders: 'keypair',
      headerParameters: { parameters: [
        { name: 'Content-Disposition', value: '=attachment; filename="fanout-{{ Date.now() }}.mp4"' },
        { name: 'Content-Type', value: 'video/mp4' },
      ] },
      sendBody: true,
      contentType: 'binaryData',
      inputDataFieldName: 'data',
      options: { timeout: 600000 },
    },
    credentials: { httpBasicAuth: newCredential('WordPress (user + application password)') },
  },
  output: [{ id: 123, source_url: 'https://sugimotovisa.com/wp-content/uploads/video.mp4' }],
});

const buildJob = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Build job',
    position: [880, 400],
    parameters: {
      jsCode: `const form = $('Video upload form').first().json;
const wp = $input.first().json;
const raw = form.Platforms;
const platforms = Array.isArray(raw) ? raw : (raw ? String(raw).split(',').map(s => s.trim()) : []);
const caption = form.Caption || '';
return [{ json: {
  job_id: 'vid-' + Date.now(),
  created_at: new Date().toISOString(),
  video_url: wp.source_url,
  wp_media_id: wp.id,
  caption,
  yt_title: (form['YouTube title'] || caption).slice(0, 95),
  platforms: platforms.join(', '),
} }];`,
    },
  },
  output: [{ job_id: 'vid-1', created_at: '2026-01-01T00:00:00.000Z', video_url: 'https://sugimotovisa.com/x.mp4', wp_media_id: 123, caption: 'c', yt_title: 't', platforms: 'Instagram, Facebook' }],
});

const recordJob = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Record job FIRST',
    position: [1120, 400],
    parameters: {
      resource: 'row',
      operation: 'insert',
      dataTableId: { __rl: true, mode: 'id', value: 'I1sppiwT4O860UGw', cachedResultName: 'video_jobs' },
      columns: {
        mappingMode: 'defineBelow',
        value: {
          job_id: "={{ $json.job_id }}",
          created_at: "={{ $json.created_at }}",
          video_url: "={{ $json.video_url }}",
          caption: "={{ $json.caption }}",
          platforms: "={{ $json.platforms }}",
          status: 'publishing',
        },
        matchingColumns: [],
        schema: [],
      },
    },
  },
  output: [{ id: 1 }],
});

// ---------- Gates: one per platform, empty output = branch skipped ----------
const igGate = node({ type: 'n8n-nodes-base.code', version: 2,
  config: { name: 'Instagram selected?', position: [1400, 100], parameters: { jsCode: `const job = $('Build job').first().json;
return job.platforms.includes('Instagram') ? [{ json: job }] : [];` } },
  output: [{ job_id: 'vid-1' }] });
const fbGate = node({ type: 'n8n-nodes-base.code', version: 2,
  config: { name: 'Facebook selected?', position: [1400, 400], parameters: { jsCode: `const job = $('Build job').first().json;
return job.platforms.includes('Facebook') ? [{ json: job }] : [];` } },
  output: [{ job_id: 'vid-1' }] });
// YouTube carries the binary forward so the file is never downloaded again.
const ytGate = node({ type: 'n8n-nodes-base.code', version: 2,
  config: { name: 'YouTube selected?', position: [1400, 620], parameters: { jsCode: `const job = $('Build job').first().json;
if (!job.platforms.includes('YouTube')) { return []; }
const src = $('Normalize video binary').first();
return [{ json: job, binary: src.binary }];` } },
  output: [{ job_id: 'vid-1' }] });
const ttGate = node({ type: 'n8n-nodes-base.code', version: 2,
  config: { name: 'TikTok selected?', position: [1400, 840], parameters: { jsCode: `const job = $('Build job').first().json;
return job.platforms.includes('TikTok') ? [{ json: job }] : [];` } },
  output: [{ job_id: 'vid-1' }] });

// ---------- Instagram Reel: container -> wait -> status -> publish ----------
const igCreate = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Create IG reel container',
    position: [1660, 100],
    onError: 'continueRegularOutput',
    parameters: {
      method: 'POST',
      url: 'https://graph.instagram.com/v21.0/26846240431664402/media',
      authentication: 'genericCredentialType',
      genericAuthType: 'httpQueryAuth',
      sendQuery: true,
      specifyQuery: 'keypair',
      queryParameters: { parameters: [
        { name: 'media_type', value: 'REELS' },
        { name: 'video_url', value: "={{ $('Build job').first().json.video_url }}" },
        { name: 'caption', value: "={{ $('Build job').first().json.caption }}" },
      ] },
      options: { timeout: 30000 },
    },
    credentials: { httpQueryAuth: newCredential('Instagram token (same query-auth credential as the draws stories)') },
  },
  output: [{ id: '18000000000000000' }],
});

const igWait = node({
  type: 'n8n-nodes-base.wait',
  version: 1.1,
  config: { name: 'Wait 30s', position: [1900, 100],
    parameters: { resume: 'timeInterval', amount: 30, unit: 'seconds' } },
  output: [{ id: '18000000000000000' }],
});

const igStatus = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Check IG container status',
    position: [2140, 100],
    onError: 'continueRegularOutput',
    parameters: {
      method: 'GET',
      url: "=https://graph.instagram.com/v21.0/{{ $('Create IG reel container').first().json.id }}",
      authentication: 'genericCredentialType',
      genericAuthType: 'httpQueryAuth',
      sendQuery: true,
      specifyQuery: 'keypair',
      queryParameters: { parameters: [ { name: 'fields', value: 'status_code' } ] },
      options: { timeout: 30000 },
    },
    credentials: { httpQueryAuth: newCredential('Instagram token (same query-auth credential as the draws stories)') },
  },
  output: [{ status_code: 'FINISHED' }],
});

// Instagram accepts the container instantly but encodes in the background, so
// poll rather than guess. 30s cadence, give up after 16 tries (8 minutes) —
// the same shape Postiz uses in production against this API.
const igReady = ifElse({
  version: 2.3,
  config: {
    name: 'Reel ready?',
    position: [2380, 100],
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
        conditions: [
          { id: 'finished', leftValue: '={{ $json.status_code }}', operator: { type: 'string', operation: 'equals' }, rightValue: 'FINISHED' },
          { id: 'giveup', leftValue: '={{ $runIndex }}', operator: { type: 'number', operation: 'gte' }, rightValue: 15 },
        ],
        combinator: 'or',
      },
      looseTypeValidation: true,
    },
  },
});

const igPublish = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Publish IG reel',
    position: [2640, 20],
    onError: 'continueRegularOutput',
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 5000,
    parameters: {
      method: 'POST',
      url: 'https://graph.instagram.com/v21.0/26846240431664402/media_publish',
      authentication: 'genericCredentialType',
      genericAuthType: 'httpQueryAuth',
      sendQuery: true,
      specifyQuery: 'keypair',
      queryParameters: { parameters: [
        { name: 'creation_id', value: "={{ $('Create IG reel container').first().json.id }}" },
      ] },
      options: { timeout: 30000 },
    },
    credentials: { httpQueryAuth: newCredential('Instagram token (same query-auth credential as the draws stories)') },
  },
  output: [{ id: '18000000000000001' }],
});

// ---------- Facebook Page video: one call, Facebook pulls the file ----------
const fbPost = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Post video to Facebook Page',
    position: [1660, 400],
    onError: 'continueRegularOutput',
    parameters: {
      method: 'POST',
      url: 'https://graph.facebook.com/v23.0/YOUR_FACEBOOK_PAGE_ID/videos',
      authentication: 'genericCredentialType',
      genericAuthType: 'httpQueryAuth',
      sendQuery: true,
      specifyQuery: 'keypair',
      queryParameters: { parameters: [
        { name: 'file_url', value: "={{ $('Build job').first().json.video_url }}" },
        { name: 'description', value: "={{ $('Build job').first().json.caption }}" },
      ] },
      options: { timeout: 300000 },
    },
    credentials: { httpQueryAuth: newCredential('Facebook Page access token (query auth, name=access_token)') },
  },
  output: [{ id: '9990001' }],
});

// ---------- YouTube Short: uses the binary already in the workflow ----------
const ytUpload = node({
  type: 'n8n-nodes-base.youTube',
  version: 1,
  config: {
    name: 'Upload YouTube Short',
    position: [1660, 620],
    onError: 'continueRegularOutput',
    parameters: {
      resource: 'video',
      operation: 'upload',
      title: "={{ $('Build job').first().json.yt_title }}",
      binaryProperty: 'data',
      categoryId: '22',
      options: {
        description: "={{ $('Build job').first().json.caption }}",
        privacyStatus: 'private',
        notifySubscribers: false,
        selfDeclaredMadeForKids: false,
      },
    },
    credentials: { youTubeOAuth2Api: newCredential('YouTube (Google OAuth2)') },
  },
  output: [{ uploadId: 'abc' }],
});

// ---------- TikTok: draft to inbox, TikTok pulls the file ----------
const ttInit = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Send draft to TikTok inbox',
    position: [1660, 840],
    onError: 'continueRegularOutput',
    parameters: {
      method: 'POST',
      url: 'https://open.tiktokapis.com/v2/post/publish/inbox/video/init/',
      authentication: 'genericCredentialType',
      genericAuthType: 'oAuth2Api',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: "={{ JSON.stringify({ source_info: { source: 'PULL_FROM_URL', video_url: $('Build job').first().json.video_url } }) }}",
      options: { timeout: 60000 },
    },
    credentials: { oAuth2Api: newCredential('TikTok OAuth2 (video.upload scope)') },
  },
  output: [{ data: { publish_id: 'p1' } }],
});

// ---------- Collect, report, then clean the hosted copy away ----------
const collect = merge({
  version: 3.2,
  config: { name: 'Collect results', position: [2900, 480],
    parameters: { mode: 'append', numberInputs: 4 } },
});

const buildReport = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Build report',
    position: [3180, 480],
    executeOnce: true,
    parameters: {
      jsCode: `function grab(name) { try { const it = $(name).first(); return it ? it.json : null; } catch (e) { return null; } }
const job = $('Build job').first().json;
const wanted = job.platforms.split(',').map(s => s.trim()).filter(Boolean);
const lines = ['\u{1F3AC} <b>Video fan-out</b> — ' + job.job_id];
function line(name, result, okText) {
  if (!wanted.includes(name)) { return; }
  if (result && !result.error) { lines.push('✅ ' + name + ': ' + okText); }
  else if (result && result.error) { lines.push('❌ ' + name + ': ' + JSON.stringify(result.error).slice(0, 300)); }
  else { lines.push('❌ ' + name + ': branch did not finish'); }
}
const ig = grab('Publish IG reel');
line('Instagram', ig, 'reel published (id ' + (ig && ig.id) + ')');
const fb = grab('Post video to Facebook Page');
line('Facebook', fb, 'page video posted (id ' + (fb && fb.id) + ')');
const yt = grab('Upload YouTube Short');
line('YouTube', yt, 'uploaded as PRIVATE (flip to public after the API audit) — https://youtu.be/' + (yt && (yt.id || yt.uploadId)));
const tt = grab('Send draft to TikTok inbox');
const ttOk = tt && tt.data && tt.data.publish_id;
if (wanted.includes('TikTok')) {
  if (ttOk) { lines.push('✅ TikTok: draft is in your TikTok inbox — open the app and tap publish'); }
  else { lines.push('❌ TikTok: ' + JSON.stringify((tt && tt.error) || 'branch did not finish').slice(0, 300)); }
}
lines.push('');
lines.push('\u{1F4CE} ' + job.video_url);
lines.push('<i>the hosted copy is deleted automatically in 2 hours</i>');
return [{ json: { text: lines.join('\n') } }];`,
    },
  },
  output: [{ text: 'report' }],
});

const tgReport = node({
  type: 'n8n-nodes-base.telegram',
  version: 1.2,
  config: {
    name: 'Telegram report',
    position: [3460, 480],
    onError: 'continueRegularOutput',
    parameters: {
      resource: 'message',
      operation: 'sendMessage',
      chatId: 'YOUR_TELEGRAM_CHAT_ID',
      text: '={{ $json.text }}',
      additionalFields: { parse_mode: 'HTML', appendAttribution: false, disable_web_page_preview: true },
    },
    credentials: { telegramApi: newCredential('Telegram bot (same as draws poster)') },
  },
  output: [{ ok: true }],
});

// TikTok downloads PULL_FROM_URL in the background, so the file has to outlive
// the run. Two hours is well inside TikTok's one-hour download timeout.
const cleanupWait = node({
  type: 'n8n-nodes-base.wait',
  version: 1.1,
  config: { name: 'Wait 2h, then clean up', position: [3740, 480],
    parameters: { resume: 'timeInterval', amount: 2, unit: 'hours' } },
  output: [{ ok: true }],
});

const deleteMedia = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Delete video from WordPress',
    position: [4020, 480],
    onError: 'continueRegularOutput',
    parameters: {
      method: 'DELETE',
      url: "=https://sugimotovisa.com/wp-json/wp/v2/media/{{ $('Build job').first().json.wp_media_id }}",
      authentication: 'genericCredentialType',
      genericAuthType: 'httpBasicAuth',
      sendQuery: true,
      specifyQuery: 'keypair',
      queryParameters: { parameters: [ { name: 'force', value: 'true' } ] },
      options: { timeout: 60000 },
    },
    credentials: { httpBasicAuth: newCredential('WordPress (user + application password)') },
  },
  output: [{ deleted: true }],
});

// ---------- Sticky notes ----------
const setupNote = sticky('## Setup (one time)\n\n1. **WordPress** node: pick your existing WP user + application password (Basic auth). Videos are 200-400 MB, so first check cPanel -> MultiPHP INI Editor and make sure: upload_max_filesize = 512M, post_max_size = 512M, memory_limit = 512M, max_execution_time = 300. If your host will not allow it, swap this node for Cloudflare R2 (free 10 GB, zero egress).\n2. **Instagram** nodes: select the SAME query-auth credential the draws stories use.\n3. **Facebook**: replace YOUR_FACEBOOK_PAGE_ID in the URL and create a query-auth credential (name access_token, value = a Page access token with pages_manage_posts). Own page = Standard Access, no App Review.\n4. **YouTube**: create a Google OAuth2 credential (free). Uploads stay PRIVATE until the free YouTube API audit clears - then change privacyStatus to public. Vertical + under 3 min = a Short automatically.\n5. **TikTok**: free developer app with video.upload scope (draft-to-inbox needs NO audit). Verify the domain sugimotovisa.com in the TikTok app settings so PULL_FROM_URL works.\n6. **Telegram**: replace YOUR_TELEGRAM_CHAT_ID, pick your existing bot credential.\n\nThen open the form URL from the Form Trigger and post your first video.', [180, -80], { width: 560, height: 420 });

const trafficNote = sticky('## Traffic per post (300 MB video)\n\nUpload to WordPress: 300 MB in.\nThen Instagram, Facebook and TikTok each fetch the file themselves: about 900 MB out.\nYouTube does NOT re-download - it uses the copy already in this workflow.\n\nSo roughly 1.2 GB per post, for a couple of minutes. Fine on most hosting. The file is deleted again 2 hours later, so your disk and your nightly backups never grow.', [1020, 640], { width: 400, height: 260 });

const igNote = sticky('## Instagram polls, it does not guess\n\nInstagram accepts the container immediately but processes the video in the background. This loop asks every 30 seconds whether it is FINISHED, and gives up after 16 tries (8 minutes) rather than hanging forever.\n\nThat cadence matches what Postiz - a production open-source scheduler - does against the same API.', [1880, -100], { width: 440, height: 240 });

const ttNote = sticky('**TikTok draft path (free, no audit)**: the video lands in your TikTok inbox as a draft - open the app, tap it, publish. TikTok downloads the file in the background, which is why cleanup waits 2 hours. To post fully automatically later, pass the free TikTok Content Posting audit and switch this URL from inbox to direct post.', [1620, 960], { width: 480, height: 120 });

export default workflow('video-fanout', 'Video Fan-out — IG + FB + YT + TikTok')
  .add(setupNote)
  .add(trafficNote)
  .add(igNote)
  .add(ttNote)
  .add(videoForm)
  .to(normalizeBinary)
  .to(wpUpload)
  .to(buildJob)
  .to(recordJob)
  .to(igGate.to(igCreate.to(igWait.to(igStatus.to(igReady
    .onTrue(igPublish.to(collect.input(0)))
    .onFalse(igWait))))))
  .add(recordJob)
  .to(fbGate.to(fbPost.to(collect.input(1))))
  .add(recordJob)
  .to(ytGate.to(ytUpload.to(collect.input(2))))
  .add(recordJob)
  .to(ttGate.to(ttInit.to(collect.input(3))))
  .add(collect)
  .to(buildReport)
  .to(tgReport)
  .to(cleanupWait)
  .to(deleteMedia);
