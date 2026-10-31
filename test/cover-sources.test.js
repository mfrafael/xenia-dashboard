'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const coverSources = require('../src/cover-sources');
const launchbox = require('../src/launchbox');

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(40, 5)]);
const BASE = 'https://raw.githubusercontent.com/xenia-manager/x360db/main/';
const temp = async t => { const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'xd-src-')); t.after(() => fs.rm(dir, { recursive: true, force: true })); return dir; };
function setup(directory, extra = {}) {
  const seen = [];
  const fetcher = async url => {
    seen.push(url);
    if (extra[url]) return extra[url]();
    if (url === `${BASE}games.json`) return new Response(JSON.stringify([{ id: '4D5307D5', title: 'Gears of War' }, { id: '4D5307E6', title: 'Halo 3' }]));
    if (url.startsWith(`${BASE}titles/`)) return new Response(JPEG);
    if (url.startsWith('https://images.launchbox-app.com/')) return new Response(JPEG);
    return new Response('no', { status: 404 });
  };
  return { sources: coverSources.create({ fetcher, setupFetcher: fetcher, directory }), seen };
}

test('both sources answer the same questions', async t => {
  const { sources } = setup(await temp(t));
  assert.deepEqual([...sources.keys()], ['launchbox', 'xenia-manager', 'launchbox-all'], 'LaunchBox is always listed before Xenia Manager; every-platform LaunchBox (native games) last');
  for (const source of sources.values()) for (const method of ['status', 'prepare', 'search', 'pictures', 'image', 'auto', 'name']) assert.equal(typeof source[method], 'function', `${source.id}.${method}`);
  assert.deepEqual(['xenia-manager', 'launchbox', 'launchbox-all'].map(id => sources.get(id).needsDownload), [false, true, true]);
  assert.deepEqual(Object.keys(coverSources.AUTO_MODES), ['launchbox', 'both', 'xenia-manager'], 'the same order in the automatic download modes');
});
test('the Xenia Manager source searches by name, offers one picture and downloads by title ID', async t => {
  const { sources } = setup(await temp(t)), manager = sources.get('xenia-manager');
  assert.deepEqual({ ...(await manager.status()) }, { ready: true, built: 0, games: 0 });
  const found = await manager.search('Gears of War'); assert.deepEqual([found[0].key, found[0].title, found[0].pictures], ['4D5307D5', 'Gears of War', 1]);
  assert.deepEqual((await manager.pictures('4D5307D5')).map(item => [item.key, item.label]), [['boxart', 'Box art']]);
  await assert.rejects(manager.pictures('FFFFFFFF'), /Unknown cover selection/); await assert.rejects(manager.pictures('../x'), /Unknown cover selection/);
  assert.equal((await manager.image('4D5307D5', 'boxart')).mime, 'image/jpeg');
  await assert.rejects(manager.image('4D5307D5', 'other'), /Unknown picture/); await assert.rejects(manager.image('FFFFFFFF', 'boxart'), /Unknown cover selection/);
  assert.equal((await manager.auto({ title: 'x', titleId: '4D5307D5' })).reference, '4D5307D5');
  assert.equal(await manager.auto({ title: 'x', titleId: undefined }), null, 'no title ID, nothing to look up');
  assert.equal(await manager.auto({ title: 'x', titleId: 'not-an-id' }), null, 'a bad ID is a miss, not a crash');
  await assert.rejects(manager.prepare(), /needs no download/);
});
test('the LaunchBox source needs its data first, then searches and matches by whole name', async t => {
  const dir = await temp(t), { sources } = setup(dir), box = sources.get('launchbox');
  assert.deepEqual({ ...(await box.status()) }, { ready: false, built: 0, games: 0 });
  for (const call of [() => box.search('Halo 3'), () => box.pictures('1'), () => box.image('1', 'a.jpg')]) await assert.rejects(call(), new RegExp(coverSources.NEEDS_DATA));
  assert.equal(await box.auto({ title: 'Halo 3' }), null, 'unattended use without data is a quiet miss');
  await launchbox.writeIndex(dir, [{ id: '1', name: 'Halo 3', images: [{ file: 'a.jpg', type: 'Box - Front', region: 'North America' }, { file: 'b.png', type: 'Box - 3D', region: '' }] }, { id: '2', name: 'Halo 3: ODST', images: [{ file: 'c.jpg', type: 'Box - Front', region: '' }] }], 7);
  const { sources: later } = setup(dir), ready = later.get('launchbox');
  assert.deepEqual({ ...(await ready.status()) }, { ready: true, built: 7, games: 2 });
  assert.deepEqual((await ready.search('Halo 3')).map(item => [item.key, item.pictures]), [['1', 2], ['2', 1]]);
  assert.deepEqual((await ready.pictures('1')).map(item => [item.key, item.label]), [['a.jpg', 'Front · North America'], ['b.png', '3D box']]);
  await assert.rejects(ready.pictures('9'), /Unknown LaunchBox game/); await assert.rejects(ready.image('1', 'c.jpg'), /Unknown LaunchBox picture/); await assert.rejects(ready.image('1', '../x.png'), /Unknown LaunchBox picture/);
  assert.equal((await ready.image('1', 'a.jpg')).mime, 'image/jpeg');
  const auto = await ready.auto({ title: 'halo 3', titleId: '4D5307E6' }); assert.deepEqual([auto.reference, auto.mime], ['1', 'image/jpeg']);
  assert.equal(await ready.auto({ title: 'Halo' }), null, 'a partial name is not a match');
});
test('the LaunchBox source downloads its data once and forgets the stale copy', async t => {
  const dir = await temp(t), { makeZip } = require('./helpers/make-zip');
  const xml = '<LaunchBox>\n  <Game>\n    <Name>Fresh Game</Name>\n    <DatabaseID>5</DatabaseID>\n    <Platform>Microsoft Xbox 360</Platform>\n  </Game>\n  <GameImage>\n    <DatabaseID>5</DatabaseID>\n    <FileName>f.jpg</FileName>\n    <Type>Box - Front</Type>\n    <Region>World</Region>\n  </GameImage>\n</LaunchBox>\n', body = makeZip([['Metadata.xml', xml]]);
  const { sources } = setup(dir, { [launchbox.ZIP_URL]: () => ({ ok: true, status: 200, headers: { get: name => name === 'content-length' ? String(body.length) : null }, body: (async function* () { yield body; })() }) });
  const box = sources.get('launchbox'); assert.equal((await box.status()).ready, false);
  const progress = []; const status = await box.prepare(item => progress.push(item));
  assert.deepEqual([status.ready, status.games], [true, 1]); assert.equal((await box.search('Fresh Game'))[0].key, '5');
});
test('every-platform LaunchBox (native games) searches all of LaunchBox, shows the platform and never picks on its own', async t => {
  const dir = await temp(t), { sources } = setup(dir), any = sources.get('launchbox-all');
  assert.equal(any.label, 'LaunchBox');
  assert.equal((await any.status()).ready, false);
  await assert.rejects(any.search('zelda'), /Download the LaunchBox data first/);
  await launchbox.writeIndex(dir, [{ id: '500', name: 'The Legend of Zelda: Majora\'s Mask', platform: 'Nintendo 64', images: [{ file: 'front.jpg', type: 'Box - Front', region: 'Japan' }] }], 3, 'all');
  const { sources: later } = setup(dir), ready = later.get('launchbox-all');
  assert.deepEqual({ ...(await ready.status()) }, { ready: true, built: 3, games: 1 });
  const [found] = await ready.search('Majora\'s Mask');
  assert.deepEqual([found.key, found.platform], ['500', 'Nintendo 64']);
  assert.equal((await ready.image('500', 'front.jpg')).mime, 'image/jpeg');
  assert.equal(await ready.auto({ title: 'The Legend of Zelda: Majora\'s Mask' }), null);
  assert.equal((await later.get('launchbox').status()).ready, false, 'the Xbox 360 index is a different file');
});
test('the bulk download order puts LaunchBox first only when asked', () => {
  assert.deepEqual({ ...coverSources.AUTO_MODES }, { 'xenia-manager': ['xenia-manager'], launchbox: ['launchbox'], both: ['launchbox', 'xenia-manager'] });
});

test('Xenia Manager names a game by title ID and says nothing for an unknown or malformed one; every-platform LaunchBox never names', async t => {
  const { sources } = setup(await temp(t)), manager = sources.get('xenia-manager');
  assert.equal(await manager.name({ titleId: '4D5307D5' }), 'Gears of War');
  assert.equal(await manager.name({ titleId: 'FFFFFFFF' }), null);
  assert.equal(await manager.name({ titleId: '../x' }), null);
  assert.equal(await manager.name({}), null);
  assert.equal(await sources.get('launchbox-all').name({ title: 'Halo 3' }), null);
  assert.equal(await sources.get('launchbox').name({ title: 'Halo 3' }), null, 'no LaunchBox data yet: nothing, not an error');
});
