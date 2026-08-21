// Safety net for the video fan-out workflow.
//
// The fan-out workflow deletes each hosted video 2 hours after posting. This
// one catches anything that slipped through — an n8n restart mid-run, or a run
// that crashed before reaching its own cleanup step. It only ever touches
// media named `fanout-*`, and stays silent when there is nothing to delete.
import { workflow, node, trigger, sticky, newCredential } from '@n8n/workflow-sdk';

const daily = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.3,
  config: {
    name: 'Daily at 03:15',
    position: [260, 380],
    parameters: { rule: { interval: [ { field: 'days', daysInterval: 1, triggerAtHour: 3, triggerAtMinute: 15 } ] } },
  },
  output: [{}],
});

const listOld = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'List fan-out videos older than 24h',
    position: [540, 380],
    alwaysOutputData: true,
    onError: 'continueRegularOutput',
    parameters: {
      method: 'GET',
      url: 'https://sugimotovisa.com/wp-json/wp/v2/media',
      authentication: 'genericCredentialType',
      genericAuthType: 'httpBasicAuth',
      sendQuery: true,
      specifyQuery: 'keypair',
      queryParameters: { parameters: [
        { name: 'media_type', value: 'video' },
        { name: 'search', value: 'fanout-' },
        { name: 'before', value: '={{ new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() }}' },
        { name: 'per_page', value: '100' },
        { name: '_fields', value: 'id,date,source_url' },
      ] },
      options: { timeout: 60000 },
    },
    credentials: { httpBasicAuth: newCredential('WordPress (user + application password)') },
  },
  output: [{ id: 123, date: '2026-01-01T00:00:00', source_url: 'https://sugimotovisa.com/x.mp4' }],
});

// Returning [] here skips every downstream node, so quiet days send no message.
const pick = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Anything to delete?',
    position: [820, 380],
    parameters: {
      jsCode: `const rows = $input.all().map(i => i.json).filter(r => r && r.id);
if (!rows.length) { return []; }
return rows.map(r => ({ json: { id: r.id, date: r.date, source_url: r.source_url } }));`,
    },
  },
  output: [{ id: 123 }],
});

const deleteOne = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Delete from WordPress',
    position: [1100, 380],
    onError: 'continueRegularOutput',
    parameters: {
      method: 'DELETE',
      url: '=https://sugimotovisa.com/wp-json/wp/v2/media/{{ $json.id }}',
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

const summarize = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Summarize',
    position: [1380, 380],
    executeOnce: true,
    parameters: {
      jsCode: `const results = $input.all().map(i => i.json);
const failed = results.filter(r => r && r.error);
const ok = results.length - failed.length;
const lines = ['\u{1F9F9} <b>Fan-out cleanup</b>'];
lines.push('Deleted ' + ok + ' leftover video file(s) from WordPress.');
if (failed.length) { lines.push('⚠️ ' + failed.length + ' could not be deleted - check the WordPress credential.'); }
return [{ json: { text: lines.join('\\n') } }];`,
    },
  },
  output: [{ text: 'summary' }],
});

const notify = node({
  type: 'n8n-nodes-base.telegram',
  version: 1.2,
  config: {
    name: 'Telegram summary',
    position: [1660, 380],
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

const note = sticky('## Safety net, not the main cleanup\n\nThe fan-out workflow already deletes each video 2 hours after posting. This one only catches files that slipped through - if n8n restarted mid-run, or a posting run crashed before it reached its own cleanup step.\n\nIt looks for videos named `fanout-*` in the WordPress media library that are more than 24 hours old, and deletes them permanently. Nothing else in your media library is touched, and it stays silent on days when there is nothing to delete.\n\nSame WordPress credential and Telegram chat ID as the main workflow.', [220, -40], { width: 560, height: 340 });

export default workflow('video-fanout-cleanup', 'Video Fan-out — daily cleanup')
  .add(note)
  .add(daily)
  .to(listOld)
  .to(pick)
  .to(deleteOne)
  .to(summarize)
  .to(notify);
