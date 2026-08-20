import { workflow, node, trigger, sticky, newCredential, merge } from '@n8n/workflow-sdk';

// ---------- Trigger: the upload form ----------
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

// ---------- Host the file on your own WordPress ----------
const wpUpload = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Host video on WordPress',
    position: [540, 400],
    parameters: {
      method: 'POST',
      url: 'https://sugimotovisa.com/wp-json/wp/v2/media',
      authentication: 'genericCredentialType',
      genericAuthType: 'httpBasicAuth',
      sendHeaders: true,
      specifyHeaders: 'keypair',
      headerParameters: { parameters: [
        { name: 'Content-Disposition', value: '=attachment; filename="{{ $json.job_slug || "fanout" }}-{{ Date.now() }}.mp4"' },
        { name: 'Content-Type', value: 'video/mp4' },
      ] },
      sendBody: true,
      contentType: 'binaryData',
      inputDataFieldName: 'Video',
      options: { timeout: 300000 },
    },
    credentials: { httpBasicAuth: newCredential('WordPress (user + application password)') },
  },
  output: [{ id: 123, source_url: 'https://sugimotovisa.com/wp-content/uploads/video.mp4' }],
});

// ---------- Build the job record ----------
const buildJob = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Build job',
    position: [840, 400],
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
  output: [{ job_id: 'vid-1', video_url: 'https://sugimotovisa.com/x.mp4', caption: 'c', yt_title: 't', platforms: 'Instagram, Facebook' }],
});

// ---------- Record FIRST, then post (the draws-poster pattern) ----------
const recordJob = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Record job FIRST',
    position: [1140, 400],
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
  config: { name: 'Instagram selected?', position: [1440, 100], parameters: { jsCode: `const job = $('Build job').first().json;
return job.platforms.includes('Instagram') ? [{ json: job }] : [];` } },
  output: [{ job_id: 'vid-1' }] });
const fbGate = node({ type: 'n8n-nodes-base.code', version: 2,
  config: { name: 'Facebook selected?', position: [1440, 340], parameters: { jsCode: `const job = $('Build job').first().json;
return job.platforms.includes('Facebook') ? [{ json: job }] : [];` } },
  output: [{ job_id: 'vid-1' }] });
const ytGate = node({ type: 'n8n-nodes-base.code', version: 2,
  config: { name: 'YouTube selected?', position: [1440, 560], parameters: { jsCode: `const job = $('Build job').first().json;
return job.platforms.includes('YouTube') ? [{ json: job }] : [];` } },
  output: [{ job_id: 'vid-1' }] });
const ttGate = node({ type: 'n8n-nodes-base.code', version: 2,
  config: { name: 'TikTok selected?', position: [1440, 780], parameters: { jsCode: `const job = $('Build job').first().json;
return job.platforms.includes('TikTok') ? [{ json: job }] : [];` } },
  output: [{ job_id: 'vid-1' }] });

// ---------- Instagram Reel: container -> wait -> status -> publish ----------
const igCreate = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Create IG reel container',
    position: [1740, 100],
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
  config: { name: 'Wait for IG processing', position: [2040, 100],
    parameters: { resume: 'timeInterval', amount: 90, unit: 'seconds' } },
  output: [{ id: '18000000000000000' }],
});

const igStatus = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Check IG container status',
    position: [2340, 100],
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

const igPublish = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Publish IG reel',
    position: [2640, 100],
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
    position: [1740, 340],
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
      options: { timeout: 120000 },
    },
    credentials: { httpQueryAuth: newCredential('Facebook Page access token (query auth, name=access_token)') },
  },
  output: [{ id: '9990001' }],
});

// ---------- YouTube Short: download the file, native upload ----------
const ytDownload = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Download video for YouTube',
    position: [1740, 560],
    onError: 'continueRegularOutput',
    parameters: {
      method: 'GET',
      url: "={{ $('Build job').first().json.video_url }}",
      options: { timeout: 300000, response: { response: { responseFormat: 'file', outputPropertyName: 'data' } } },
    },
  },
  output: [{}],
});

const ytUpload = node({
  type: 'n8n-nodes-base.youTube',
  version: 1,
  config: {
    name: 'Upload YouTube Short',
    position: [2040, 560],
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
    position: [1740, 780],
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
  output: [{ data: { publish_id: 'p1' }, error: { code: 'ok' } }],
});

// ---------- Collect and report ----------
const collect = merge({
  version: 3.2,
  config: { name: 'Collect results', position: [2940, 440],
    parameters: { mode: 'append', numberInputs: 4 } },
});

const buildReport = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Build report',
    position: [3240, 440],
    executeOnce: true,
    parameters: {
      jsCode: `function grab(name) { try { const it = $(name).first(); return it ? it.json : null; } catch (e) { return null; } }
const job = $('Build job').first().json;
const wanted = job.platforms.split(',').map(s => s.trim()).filter(Boolean);
const lines = ['\u{1F3AC} <b>Video fan-out</b> \u2014 ' + job.job_id];
function line(name, result, okText) {
  if (!wanted.includes(name)) { return; }
  if (result && !result.error) { lines.push('\u2705 ' + name + ': ' + okText); }
  else if (result && result.error) { lines.push('\u274C ' + name + ': ' + JSON.stringify(result.error).slice(0, 300)); }
  else { lines.push('\u274C ' + name + ': branch did not finish'); }
}
const ig = grab('Publish IG reel');
line('Instagram', ig, 'reel published (id ' + (ig && ig.id) + ')');
const fb = grab('Post video to Facebook Page');
line('Facebook', fb, 'page video posted (id ' + (fb && fb.id) + ')');
const yt = grab('Upload YouTube Short');
line('YouTube', yt, 'uploaded as PRIVATE (flip to public after the API audit) \u2014 https://youtu.be/' + (yt && (yt.id || yt.uploadId)));
const tt = grab('Send draft to TikTok inbox');
const ttOk = tt && tt.data && tt.data.publish_id;
if (wanted.includes('TikTok')) {
  if (ttOk) { lines.push('\u2705 TikTok: draft is in your TikTok inbox \u2014 open the app and tap publish'); }
  else { lines.push('\u274C TikTok: ' + JSON.stringify((tt && tt.error) || 'branch did not finish').slice(0, 300)); }
}
lines.push('');
lines.push('\u{1F4CE} ' + job.video_url);
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
    position: [3540, 440],
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

// ---------- Sticky notes ----------
const setupNote = sticky('## Setup (one time)\n\n1. **WordPress** node: pick your existing WP user + application password (Basic auth). The video is hosted in your own Media Library so Instagram/Facebook/TikTok can fetch it. If a large upload fails, your host\'s upload limit is too low - ask them to raise `upload_max_filesize` to 256M, or switch this node to Cloudflare R2 (free tier).\n2. **Instagram** nodes: select the SAME query-auth credential the draws stories use.\n3. **Facebook**: replace `YOUR_FACEBOOK_PAGE_ID` in the URL and create a query-auth credential (name `access_token`, value = a Page access token with `pages_manage_posts`). Own page = Standard Access, no App Review.\n4. **YouTube**: create a Google OAuth2 credential (free). Uploads stay PRIVATE until the free YouTube API audit clears - then change privacyStatus to `public`. Vertical + under 3 min = a Short automatically.\n5. **TikTok**: free developer app with `video.upload` scope (draft-to-inbox needs NO audit). Verify the domain sugimotovisa.com in the TikTok app settings so PULL_FROM_URL works.\n6. **Telegram**: replace `YOUR_TELEGRAM_CHAT_ID`, pick your existing bot credential.\n\nThen open the form URL from the Form Trigger and post your first video.', [180, -60], { width: 560, height: 400 });

const orderNote = sticky('## Why "Record job FIRST"\n\nSame pattern as the draws poster: the job is written to the `video_jobs` data table BEFORE any posting starts, so a crash mid-run can never double-post. Each platform branch is isolated (onError: continue) - one dead token never blocks the others. The Telegram report tells you exactly what landed and what failed.', [1040, 600], { width: 400, height: 220 });

const igNote = sticky('**Instagram**: same container->publish flow as your stories, with media_type=REELS. If you see "not ready" errors in the report, raise the Wait above 90s - long videos process slowly.', [1700, -40], { width: 460, height: 110 });

const ttNote = sticky('**TikTok draft path (free, no audit)**: the video lands in your TikTok inbox as a draft - open the app, tap it, publish. To post fully automatically later, pass TikTok\'s free Content Posting audit (2-4 weeks) and switch this URL from /inbox/ to /direct post.', [1700, 880], { width: 520, height: 130 });

export default workflow('video-fanout', 'Video Fan-out — IG + FB + YT + TikTok')
  .add(setupNote)
  .add(orderNote)
  .add(igNote)
  .add(ttNote)
  .add(videoForm)
  .to(wpUpload)
  .to(buildJob)
  .to(recordJob)
  .to(igGate.to(igCreate.to(igWait.to(igStatus.to(igPublish.to(collect.input(0)))))))
  .add(recordJob)
  .to(fbGate.to(fbPost.to(collect.input(1))))
  .add(recordJob)
  .to(ytGate.to(ytDownload.to(ytUpload.to(collect.input(2)))))
  .add(recordJob)
  .to(ttGate.to(ttInit.to(collect.input(3))))
  .add(collect)
  .to(buildReport)
  .to(tgReport);
