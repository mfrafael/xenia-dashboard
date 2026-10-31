'use strict';
// Native games: files that run by themselves, without Xenia (recompilations, PC ports). The library keeps them in
// `native_games` as { path, title, runner? }, chosen one by one in Xenia Settings › Locations; nothing scans for them.
// On Windows an .exe is just run (a .bat/.cmd/.lnk goes through cmd.exe); on Linux any file is run as it is, except a
// Windows .exe, which goes through Wine or Proton.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { cleanTitle } = require('./scanner');

const MAX_PATH = 4096, MAX_TITLE = 120;
// The types the picker lists first. On Linux any other file can be chosen too ("All files"); Windows only runs these.
const EXTENSIONS = platform => (platform === 'linux' ? ['.exe', '.appimage', '.sh'] : ['.exe', '.bat', '.cmd', '.lnk']);
const isNativePath = (file, platform) => typeof file === 'string' && file.length <= MAX_PATH && !file.includes('\0') &&
  (path.isAbsolute(file) || path.win32.isAbsolute(file)) && (platform === 'linux' || EXTENSIONS(platform).includes(path.extname(file).toLowerCase()));
const label = ext => (ext === '.appimage' ? '.AppImage' : ext);
const pickerFilters = platform => [
  { name: `Games and launchers (${EXTENSIONS(platform).map(label).join(', ')})`, extensions: EXTENSIONS(platform).map(ext => (ext === '.appimage' ? 'AppImage' : ext.slice(1))) },
  ...(platform === 'linux' ? [{ name: 'All files', extensions: ['*'] }] : []),
];
const fileHint = platform => (platform === 'linux' ? '.exe, .AppImage, .sh or any file that starts the game' : '.exe, .bat, .cmd or .lnk');
const validTitle = title => typeof title === 'string' && title.trim().length > 0 && title.trim().length <= MAX_TITLE;
// Same formula as the first version (hernjon's), so games added there keep their hidden state and covers.
const gameId = file => crypto.createHash('sha256').update(path.resolve(file)).digest('hex').slice(0, 20);

// Every entry that is still usable. The platform is not checked here: a library carried to another system keeps its list.
function entries(library) {
  const list = Array.isArray(library?.native_games) ? library.native_games : [];
  return list.filter(entry => isNativePath(entry?.path, 'linux') && validTitle(entry.title) && (entry.runner === undefined || entry.runner === null || (typeof entry.runner === 'string' && path.isAbsolute(entry.runner))))
    .map(entry => ({ path: entry.path, title: entry.title.trim(), ...(entry.runner ? { runner: entry.runner } : {}) }));
}

// The first version kept a plain list of paths in `exe_games`; each one becomes an entry named after its file.
function migrate(library) {
  if (!Object.hasOwn(library, 'exe_games')) return library;
  const { exe_games: old, ...rest } = library, list = entries(library), known = new Set(list.map(entry => path.resolve(entry.path)));
  for (const file of Array.isArray(old) ? old : []) {
    if (!isNativePath(file, 'linux') || known.has(path.resolve(file))) continue;
    known.add(path.resolve(file)); list.push({ path: file, title: cleanTitle(file).slice(0, MAX_TITLE).trim() });
  }
  return { ...rest, native_games: list };
}

// Library games for the entries. A same-name .png/.jpg next to the file is its cover until the user picks one.
async function games(list, platform, onError) {
  const found = [];
  for (const entry of list) {
    try {
      if (!isNativePath(entry.path, platform)) throw Error('This game file cannot run on this system');
      const full = path.resolve(entry.path);
      if (!(await fs.stat(full)).isFile()) throw Error('The game file is not a file');
      const stem = path.basename(full, path.extname(full)).toLowerCase();
      let cover = null;
      try {
        const names = (await fs.readdir(path.dirname(full), { withFileTypes: true })).filter(item => item.isFile()).map(item => item.name);
        cover = ['.png', '.jpg', '.jpeg'].map(ext => names.find(name => name.toLowerCase() === stem + ext)).find(Boolean) || null;
      } catch { /* No picture; the game still shows. */ }
      found.push({ id: gameId(full), kind: 'native', title: entry.title, rom_path: full, cover_art_path: cover ? path.join(path.dirname(full), cover) : null, uses_fallback_art: !cover });
    } catch (error) { if (!onError) throw error; onError(entry.path, error); }
  }
  return found.sort((a, b) => a.title.localeCompare(b.title) || a.rom_path.localeCompare(b.rom_path));
}

// What to start for one game. Proton is told where the game's own prefix and Steam are; it takes no extra arguments.
// `script` is true for a Linux .sh without a #! line: it runs through sh instead of failing with "Exec format error".
function launchCommand({ file, platform, runner, runnerArgs = [], userData, steamRoot, gameId: id, script = false }) {
  const plain = { command: file, args: [], env: null, cwd: path.dirname(file), prefix: null };
  const ext = path.extname(file).toLowerCase();
  if (platform === 'win32' && (ext === '.bat' || ext === '.cmd' || ext === '.lnk')) {
    // cmd.exe reads its command line itself, so the file goes in quotes, untouched by Node's argument quoting.
    if (/["%]/.test(file)) throw Error('This file name has a character (" or %) that cannot be started from here. Rename it.');
    const inner = ext === '.lnk' ? `start "" /wait "${file}"` : `call "${file}"`;
    return { command: 'cmd.exe', args: ['/d', '/s', '/c', `"${inner}"`], env: null, cwd: path.dirname(file), prefix: null, verbatim: true };
  }
  if (platform === 'linux' && ext === '.sh' && script) return { ...plain, command: 'sh', args: [file] };
  if (platform !== 'linux' || ext !== '.exe') return plain;
  const chosen = runner && runner !== 'native' ? runner : 'wine';
  if (path.basename(chosen) === 'proton') {
    const prefix = path.join(userData, 'proton-prefixes', id);
    return { command: chosen, args: ['run', file], env: { STEAM_COMPAT_DATA_PATH: prefix, STEAM_COMPAT_CLIENT_INSTALL_PATH: steamRoot }, cwd: path.dirname(file), prefix };
  }
  return { command: chosen, args: [...runnerArgs, file], env: null, cwd: path.dirname(file), prefix: null };
}

module.exports = { EXTENSIONS, pickerFilters, fileHint, MAX_TITLE, isNativePath, validTitle, gameId, entries, migrate, games, launchCommand };
