// Read-only Google Drive (DRIVE_READ_ONLY=1, used by the nightly replay of past
// clients): every write is refused before anything is sent, and the Drive
// store keeps files on the server disk.
//   node test/driveReadOnly.test.mjs
import { loadLib } from './_load.mjs';

process.env.DRIVE_READ_ONLY = '1';
const drive = await loadLib('drive.js');
let bad = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) bad++; };
const refused = async (what, fn) => {
  try {
    await fn();
    ok(false, `${what} is refused`);
  } catch (e) {
    ok(/read-only/.test(e.message) && e.status === 403, `${what} is refused (${e.message})`);
  }
};
ok(drive.driveReadOnly(), 'DRIVE_READ_ONLY=1 is read-only');
await refused('create a folder', () => drive.createFolder('parentFolder01', 'x'));
await refused('upload a file', () => drive.uploadFile('parentFolder01', 'x.pdf', 'application/pdf', Buffer.from('x')));
await refused('replace a file', () => drive.updateFile('someFile00001', 'x.pdf', 'application/pdf', Buffer.from('x')));
await refused('rename a file', () => drive.renameFile('someFile00001', 'x'));
await refused('move a file to the bin', () => drive.trashFile('someFile00001'));
await refused('stream a file up', () => drive.uploadFromDisk({ parentId: 'parentFolder01', name: 'x', mime: 'text/plain', file: '/dev/null' }));
process.env.DRIVE_READ_ONLY = '';
ok(!drive.driveReadOnly(), 'without it, writes are allowed again');
console.log(bad ? `\n${bad} FAILED` : '\nread-only Drive: all checks pass');
process.exit(bad ? 1 : 0);
