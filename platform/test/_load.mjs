// Loads a module from lib/ for tests, outside Next's bundler.
//
// The app's lib files are ESM-syntax .js with extensionless relative imports
// (fine for Next/webpack, not for plain Node). This mirrors lib/ into a temp
// folder with ".js" added to relative imports and imports from there.
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { fileURLToPath, pathToFileURL } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const LIB = path.join(here, '..', 'lib');
let mirror = null;

async function copyDir(src, dst) {
  await fs.mkdir(dst, { recursive: true });
  for (const e of await fs.readdir(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if (e.isDirectory()) await copyDir(s, d);
    else if (e.name.endsWith('.js')) {
      let code = await fs.readFile(s, 'utf8');
      code = code.replace(/(from\s+['"])(\.{1,2}\/[^'"]+?)(['"])/g, (m, a, p, c) =>
        /\.(m?js|json)$/.test(p) ? m : `${a}${p}.js${c}`
      );
      await fs.writeFile(d, code);
    } else await fs.copyFile(s, d);
  }
}

export async function loadLib(rel) {
  if (!mirror) {
    mirror = path.join(os.tmpdir(), `libmirror-${process.pid}`);
    await copyDir(LIB, mirror);
    // node_modules resolution: symlink the package's node_modules next to it.
    const nm = path.join(mirror, '..', `libmirror-${process.pid}-nm`);
    await fs.rm(nm, { force: true, recursive: true }).catch(() => {});
    await fs.symlink(path.join(here, '..', 'node_modules'), path.join(mirror, 'node_modules'), 'dir').catch(() => {});
  }
  return import(pathToFileURL(path.join(mirror, rel)).href);
}
