'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const native = require('../src/native-games');

test('native game files: any file on Linux, .exe/.bat/.cmd/.lnk on Windows, absolute and clean paths only', () => {
  assert.deepEqual(native.EXTENSIONS('win32'), ['.exe', '.bat', '.cmd', '.lnk']);
  assert.deepEqual(native.EXTENSIONS('linux'), ['.exe', '.appimage', '.sh']);
  assert.equal(native.isNativePath('/g/A.AppImage', 'win32'), false);
  assert.equal(native.isNativePath('C:\\G\\notes.txt', 'win32'), false);
  for (const name of ['A.APPIMAGE', 'start.sh', 'launcher', 'run.py']) assert.equal(native.isNativePath(`/g/${name}`, 'linux'), true, name);
  for (const name of ['S.BAT', 'S.cmd', 'S.Lnk']) assert.equal(native.isNativePath(`C:\\G\\${name}`, 'win32'), true, name);
  assert.deepEqual(native.pickerFilters('win32').length, 1);
  assert.deepEqual(native.pickerFilters('linux')[1], { name: 'All files', extensions: ['*'] });
  assert.equal(native.isNativePath('C:\\Games\\Recomp.EXE', 'win32'), true);
  assert.equal(native.isNativePath('rel.exe', 'linux'), false);
  assert.equal(native.isNativePath('/g/a\0.exe', 'linux'), false);
  assert.equal(native.isNativePath(`/${'a'.repeat(4096)}.exe`, 'linux'), false);
  assert.equal(native.isNativePath(42, 'linux'), false);
});

test('the old exe_games list becomes native_games once, without duplicates or invalid entries', () => {
  const before = { runner: 'wine', exe_games: ['/g/Sonic Recomp.exe', '/g/Sonic Recomp.exe', 'bad'], native_games: [{ path: '/g/z.exe', title: 'Z' }] };
  const after = native.migrate(before);
  assert.deepEqual(after.native_games, [{ path: '/g/z.exe', title: 'Z' }, { path: '/g/Sonic Recomp.exe', title: 'Sonic Recomp' }]);
  assert.equal(Object.hasOwn(after, 'exe_games'), false);
  assert.equal(after.runner, 'wine');
  assert.deepEqual(native.migrate(after), after);
  assert.ok(before.exe_games, 'the original object is left alone');
  const long = `/g/${'Very Long Name '.repeat(12)}.exe`, kept = native.migrate({ exe_games: [long] });
  assert.equal(native.entries(kept).length, 1, 'a long file name is kept, its title shortened');
  assert.ok(kept.native_games[0].title.length <= native.MAX_TITLE);
  assert.deepEqual(native.entries({}), []);
  assert.deepEqual(native.entries({ native_games: [{ path: 'rel.exe', title: 'x' }, { path: '/g/a.exe', title: '' }, { path: '/g/b.exe', title: 'B', runner: '/w/wine' }] }), [{ path: '/g/b.exe', title: 'B', runner: '/w/wine' }]);
});

test('a native game keeps the id hernjon\'s version gave it', () => {
  assert.equal(native.gameId('/g/a.exe'), crypto.createHash('sha256').update(path.resolve('/g/a.exe')).digest('hex').slice(0, 20));
});

test('native games use the typed title and a same-name picture; a missing file is reported, not fatal', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'xd-native-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, 'x.exe'), 'game');
  await fs.writeFile(path.join(root, 'x.PNG'), 'cover');
  const missing = path.join(root, 'gone.exe'), failed = [];
  const games = await native.games([{ path: path.join(root, 'x.exe'), title: 'Sonic Unleashed' }, { path: missing, title: 'Gone' }], 'linux', file => failed.push(file));
  assert.equal(games.length, 1);
  assert.equal(games[0].title, 'Sonic Unleashed');
  assert.equal(games[0].kind, 'native');
  assert.equal(games[0].id, native.gameId(path.join(root, 'x.exe')));
  assert.equal(games[0].cover_art_path, path.join(root, 'x.PNG'));
  assert.equal(games[0].uses_fallback_art, false);
  assert.deepEqual(failed, [missing]);
  await assert.rejects(native.games([{ path: missing, title: 'Gone' }], 'linux'));
});

test('Windows .bat/.cmd/.lnk start through cmd.exe, quoted as one piece; names cmd would misread are refused', () => {
  const base = { platform: 'win32', userData: 'C:\\d', steamRoot: null, gameId: 'abc' };
  const bat = native.launchCommand({ ...base, file: 'C:\\My Games\\A & B\\Start.bat' });
  assert.deepEqual(bat, { command: 'cmd.exe', args: ['/d', '/s', '/c', '"call "C:\\My Games\\A & B\\Start.bat""'], env: null, cwd: path.dirname('C:\\My Games\\A & B\\Start.bat'), prefix: null, verbatim: true });
  assert.equal(native.launchCommand({ ...base, file: 'C:\\G\\Game.LNK' }).args[3], '"start "" /wait "C:\\G\\Game.LNK""');
  assert.throws(() => native.launchCommand({ ...base, file: 'C:\\G\\100%.bat' }), /Rename it/);
  assert.equal(native.launchCommand({ ...base, file: 'C:\\G\\R.exe' }).verbatim, undefined);
});

test('a .sh without a #! line runs through sh; one with it, and any other Linux file, as it is', () => {
  const base = { platform: 'linux', userData: '/d', steamRoot: '/s', gameId: 'abc' };
  assert.deepEqual(native.launchCommand({ ...base, file: '/g/run.sh', script: true }), { command: 'sh', args: ['/g/run.sh'], env: null, cwd: '/g', prefix: null });
  assert.equal(native.launchCommand({ ...base, file: '/g/run.sh' }).command, '/g/run.sh');
  assert.equal(native.launchCommand({ ...base, file: '/g/launcher' }).command, '/g/launcher');
});

test('the launch command for each platform, file type and runner', () => {
  const file = '/home/x/Jogos/Sonic Unleashed – Recomp/Unleashed "R".exe', cwd = path.dirname(file), base = { file, userData: '/data', steamRoot: '/home/x/.steam/steam', gameId: 'abc' };
  assert.deepEqual(native.launchCommand({ ...base, platform: 'win32', file: 'C:\\G\\R.exe' }), { command: 'C:\\G\\R.exe', args: [], env: null, cwd: path.dirname('C:\\G\\R.exe'), prefix: null });
  assert.deepEqual(native.launchCommand({ ...base, platform: 'linux', file: '/g/Game.AppImage' }), { command: '/g/Game.AppImage', args: [], env: null, cwd: '/g', prefix: null });
  assert.deepEqual(native.launchCommand({ ...base, platform: 'linux', runner: 'wine', runnerArgs: ['-windowed'] }), { command: 'wine', args: ['-windowed', file], env: null, cwd, prefix: null });
  assert.equal(native.launchCommand({ ...base, platform: 'linux', runner: 'native' }).command, 'wine');
  assert.equal(native.launchCommand({ ...base, platform: 'linux' }).command, 'wine');
  const proton = '/home/x/.steam/steam/compatibilitytools.d/GE-Proton9-20/proton', prefix = path.join('/data', 'proton-prefixes', 'abc');
  assert.deepEqual(native.launchCommand({ ...base, platform: 'linux', runner: proton, runnerArgs: ['-windowed'] }), { command: proton, args: ['run', file], env: { STEAM_COMPAT_DATA_PATH: prefix, STEAM_COMPAT_CLIENT_INSTALL_PATH: '/home/x/.steam/steam' }, cwd, prefix });
});
