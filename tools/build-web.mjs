// ============================================================
// Build the two distributable versions of the game into dist/
//
//   node tools/build-web.mjs
//
// dist/web  — solo vs bots only, plain static files. Upload to itch.io
//             (zip the folder contents) or copy into a website.
// dist/lan  — the full game plus the Node server, for hosting online
//             matches on your own machine (multiplayer enabled).
// ============================================================
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');

const GAME_FILES = ['index.html', 'arena.html', 'data.csv', 'UI', 'game', 'assets'];

function copy(from, to, skip = () => false) {
  if (skip(from)) return;
  const stat = fs.statSync(from);
  if (stat.isDirectory()) {
    fs.mkdirSync(to, { recursive: true });
    for (const entry of fs.readdirSync(from)) copy(path.join(from, entry), path.join(to, entry), skip);
  } else {
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
  }
}

function setMultiplayer(dir, enabled) {
  const file = path.join(dir, 'game', 'config.js');
  const src  = fs.readFileSync(file, 'utf8');
  const out  = src.replace(/multiplayer:\s*(true|false)/, `multiplayer: ${enabled}`);
  if (out === src && !src.includes(`multiplayer: ${enabled}`)) throw new Error('could not set multiplayer flag');
  fs.writeFileSync(file, out);
}

function sizeOf(dir) {
  return fs.readdirSync(dir).reduce((sum, e) => {
    const p = path.join(dir, e), s = fs.statSync(p);
    return sum + (s.isDirectory() ? sizeOf(p) : s.size);
  }, 0);
}

fs.rmSync(dist, { recursive: true, force: true });

// ── web: solo only, no lobby page, no server ──────────────────────────────
const web = path.join(dist, 'web');
for (const f of GAME_FILES) {
  copy(path.join(root, f), path.join(web, f), p => path.basename(p) === 'pinCode.html');
}
setMultiplayer(web, false);

// ── lan: everything needed to host online matches ─────────────────────────
const lan = path.join(dist, 'lan');
for (const f of [...GAME_FILES, 'README.md']) copy(path.join(root, f), path.join(lan, f));
copy(path.join(root, 'backend'), path.join(lan, 'backend'), p => path.basename(p) === 'node_modules');
setMultiplayer(lan, true);
fs.writeFileSync(path.join(lan, 'HOW-TO-HOST.txt'), [
  'Slaying Goliath: online multiplayer (2-4 players)',
  '',
  '1. Install Node.js 18 or newer (https://nodejs.org).',
  '2. In a terminal, open the "backend" folder in this download and run:',
  '     npm install',
  '     node index.js',
  '3. Open http://localhost:9091 and choose Skirmish -> Host New Game.',
  '4. Friends on the same network open the "LAN" address the server prints',
  '   (e.g. http://192.168.1.20:9091), choose Skirmish -> Join, and enter the room code.',
  '',
  'Playing over the internet instead of one network needs port 9091 forwarded',
  'on the host\'s router, or a tunnel such as ngrok. Solo vs bots needs none of this.',
  '',
].join('\n'));

const mb = d => (sizeOf(d) / 1024 / 1024).toFixed(1) + ' MB';
console.log(`dist/web  ${mb(web)}  (solo, static)`);
console.log(`dist/lan  ${mb(lan)}  (with server)`);
