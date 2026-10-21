'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const xboxTitle = require('./xbox-title');
const extensions = new Set(['.iso', '.xex', '.god', '.zar']);
function cleanTitle(name) {
  return path.basename(name, path.extname(name)).replace(/\[[^\]]*\]|\([^)]*\)/g, '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_.-]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Untitled Game';
}
function hashPin(pin, salt = crypto.randomBytes(16).toString('hex')) {
  return { salt, hash: crypto.scryptSync(pin, salt, 32).toString('hex') };
}
function validCredential(credential){return !!credential&&typeof credential.salt==='string'&&/^[a-f0-9]{32}$/.test(credential.salt)&&typeof credential.hash==='string'&&/^[a-f0-9]{64}$/.test(credential.hash);}
function verifyPin(pin, credential) {
  if (typeof pin !== 'string' || !/^\d{4,8}$/.test(pin)) return false;
  if(!validCredential(credential))return false;
  const actual = hashPin(pin, credential.salt).hash;
  const expected = Buffer.from(credential.hash, 'hex');
  return expected.length === 32 && crypto.timingSafeEqual(Buffer.from(actual, 'hex'), expected);
}
async function saveLibrary(file, library) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${crypto.randomBytes(8).toString('hex')}.tmp`;
  let created=false;
  try{
    await fs.writeFile(temp, JSON.stringify(library, null, 2), { mode: 0o600,flag:'wx' });
    created=true;
    await fs.rename(temp, file);
  }finally{if(created)await fs.unlink(temp).catch(()=>{});}
}
async function loadLibrary(file) {
  try {
    const data = JSON.parse(await fs.readFile(file, 'utf8'));
    if (!Array.isArray(data.games) || typeof data.rom_directory !== 'string' || typeof data.xenia_executable !== 'string') throw new Error('Invalid library schema');
    if (!data.admin_credential) {
      if(typeof data.admin_pin!=='string'||!/^\d{4,8}$/.test(data.admin_pin))throw Error('Missing administrator credential');
      data.admin_credential = hashPin(data.admin_pin);
      delete data.admin_pin;
      await saveLibrary(file, data);
    }
    if(!validCredential(data.admin_credential))throw Error('Invalid administrator credential');
    data.rom_directories = romFolders(data);
    return data;
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error(`Cannot read library.json: ${error.message}`);
    const data = { platform_os: process.platform, rom_directory: '', rom_directories: [], xenia_executable: '', runner: 'wine', runner_args: [], admin_credential: hashPin('1234'), admin_pin_required: false, pin_is_default: true, games: [] };
    await saveLibrary(file, data);
    return data;
  }
}
// XBLA and Games-on-Demand titles are STFS packages that usually have no file extension.
// Packages that are content for a game (DLC, title updates, saves, avatar items, themes, pictures) are not games.
const NOT_GAMES = new Set(Object.values(xboxTitle.CONTENT_TYPES));
async function isGameFile(full, name) {
  if (extensions.has(path.extname(name).toLowerCase())) return true;
  if (path.extname(name)) return false;
  try { if (!(await xboxTitle.isPackage(full))) return false; const info = await xboxTitle.readTitleInfo(full); return !NOT_GAMES.has(info.content_type); } catch { return false; }
}
async function describeGame(game, readInfo) {
  try {
    const info = await readInfo(game.rom_path);
    Object.assign(game, { title_id: info.title_id, media_id: info.media_id, ...(info.disc_count > 1 ? { disc_number: info.disc_number, disc_count: info.disc_count } : {}) });
    // GOD packages are named by content hash; their header carries the real title.
    if (info.display_name && /^[0-9A-F]{16,}$/i.test(path.basename(game.rom_path))) game.title = info.display_name;
  } catch { /* Unknown layouts still launch; they just lack title metadata. */ }
  return game;
}
async function scanDirectory(directory, readInfo = xboxTitle.readTitleInfo) {
  if (!directory) return [];
  const games = [];
  async function walk(folder) {
    const entries = await fs.readdir(folder, { withFileTypes: true });
    const names = new Map(entries.filter(e => e.isFile()).map(e => [e.name.toLowerCase(), e.name]));
    for (const entry of entries) {
      const full = path.join(folder, entry.name);
      if (entry.isDirectory()) { await walk(full); continue; }
      if (!entry.isFile() || !(await isGameFile(full, entry.name))) continue;
      const stem = path.basename(entry.name, path.extname(entry.name));
      const cover = ['.png', '.jpg', '.jpeg'].map(ext => names.get((stem + ext).toLowerCase())).find(Boolean);
      games.push({ id: crypto.createHash('sha256').update(full).digest('hex').slice(0, 20), title: cleanTitle(entry.name), rom_path: full, cover_art_path: cover ? path.join(folder, cover) : null, uses_fallback_art: !cover });
    }
  }
  await walk(path.resolve(directory));
  for (const game of games) await describeGame(game, readInfo);
  return games.sort((a, b) => a.title.localeCompare(b.title) || a.rom_path.localeCompare(b.rom_path));
}
// DLC and title updates sitting in a folder (named by hash, no extension), ready to be installed into Xenia.
const INSTALLABLE = new Set([xboxTitle.CONTENT_TYPES.DLC, xboxTitle.CONTENT_TYPES.TITLE_UPDATE]);
async function scanPackages(directory, readInfo = xboxTitle.readTitleInfo, limit = 5000) {
  const found = [];
  if (!directory) return found;
  async function walk(folder) {
    for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
      if (found.length >= limit) return;
      const full = path.join(folder, entry.name);
      if (entry.isDirectory()) { await walk(full); continue; }
      if (!entry.isFile() || path.extname(entry.name)) continue;
      try {
        const info = await readInfo(full);
        if (info.kind !== 'stfs' || !INSTALLABLE.has(info.content_type)) continue;
        const stat = await fs.stat(full);
        found.push({ path: full, name: entry.name, title_id: info.title_id, content_type: info.content_type, display_name: info.display_name || '', title_name: info.title_name || '', size: stat.size });
      } catch { /* not a package */ }
    }
  }
  await walk(path.resolve(directory));
  return found.sort((a, b) => a.title_id.localeCompare(b.title_id) || a.content_type - b.content_type || a.name.localeCompare(b.name));
}
// Every folder the user keeps games in. Older libraries had a single `rom_directory`.
function romFolders(data) {
  const list = Array.isArray(data?.rom_directories) ? data.rom_directories : data?.rom_directory ? [data.rom_directory] : [];
  return [...new Set(list.filter(folder => typeof folder === 'string' && folder))];
}
// A folder that cannot be read (a drive that is unplugged) does not hide the games of the others: it is reported instead.
async function eachFolder(directories, work, onError) {
  const out = [];
  for (const directory of directories) { try { out.push(...await work(directory)); } catch (error) { if (!onError) throw error; onError(directory, error); } }
  return out;
}
async function scanDirectories(directories, readInfo = xboxTitle.readTitleInfo, onError) {
  const found = new Map();
  for (const game of await eachFolder(directories, folder => scanDirectory(folder, readInfo), onError)) if (!found.has(game.rom_path)) found.set(game.rom_path, game);
  return [...found.values()].sort((a, b) => a.title.localeCompare(b.title) || a.rom_path.localeCompare(b.rom_path));
}
async function scanPackagesIn(directories, readInfo = xboxTitle.readTitleInfo, onError) {
  const found = new Map();
  for (const item of await eachFolder(directories, folder => scanPackages(folder, readInfo), onError)) if (!found.has(item.path)) found.set(item.path, item);
  return [...found.values()].sort((a, b) => a.title_id.localeCompare(b.title_id) || a.content_type - b.content_type || a.name.localeCompare(b.name));
}
module.exports = { romFolders, scanDirectories, scanPackagesIn, cleanTitle, hashPin, verifyPin, saveLibrary, loadLibrary, scanDirectory, scanPackages };
