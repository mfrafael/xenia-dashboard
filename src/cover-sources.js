'use strict';
// Where covers can come from. Every source answers the same few questions, so the cover manager (one screen, one set
// of IPC calls) never needs to know which one it is talking to:
//   status()                  → { ready, built, games }   (a source that needs a download says ready:false until then)
//   prepare(onProgress)       → downloads what the source needs once, then returns status()
//   search(title)             → [{ key, title, pictures }]  games that look like the title
//   pictures(key)             → [{ key, label }]            what that game offers
//   image(key, pictureKey)    → { bytes, mime }             one picture, checked to really be a JPEG or PNG
//   auto({ title, titleId })  → { bytes, mime, reference } | null   the unattended answer, or nothing
//   name({ title, titleId })  → string | null   the source's own name for the game (punctuation and all), or nothing
// Keys come from the source's own answers and are re-checked against its data on every call.
const covers = require('./covers');
const launchbox = require('./launchbox');

// The bulk download tries these sources in this order and keeps the first picture it gets.
const AUTO_MODES = { launchbox: ['launchbox'], both: ['launchbox', 'xenia-manager'], 'xenia-manager': ['xenia-manager'] };
const NEEDS_DATA = 'Download the LaunchBox data first.';

function create({ fetcher, setupFetcher, directory }) {
  const manager = covers.createService(fetcher);
  let index, allIndex;
  const data = async () => (index ??= await launchbox.readIndex(directory));
  const allData = async () => (allIndex ??= await launchbox.readIndex(directory, 'all'));
  const need = async () => { const found = await data(); if (!found) throw Error(NEEDS_DATA); return found.games; };
  const needAll = async () => { const found = await allData(); if (!found) throw Error(NEEDS_DATA); return found.games; };
  // One download writes both indexes, so either source's prepare makes both read their file again.
  const prepare = async onProgress => { await launchbox.prepare(directory, { fetcher: setupFetcher, onProgress }); index = undefined; allIndex = undefined; };
  const sources = new Map();

  // LaunchBox is listed before Xenia Manager everywhere (this order is the one the screens show).
  sources.set('launchbox', {
    id: 'launchbox', label: 'LaunchBox', needsDownload: true,
    async status() { const found = await data(); return { ready: !!found, built: found?.built || 0, games: found?.games.length || 0 }; },
    async prepare(onProgress) { await prepare(onProgress); return this.status(); },
    async search(title) { return launchbox.search(await need(), title).map(game => ({ key: game.id, title: game.title, pictures: game.pictures })); },
    async pictures(key) { return launchbox.pictures(await need(), key).map(picture => ({ key: picture.file, label: picture.label })); },
    async image(key, picture) { return launchbox.fetchImage(await need(), key, picture, fetcher); },
    // Only a game whose whole name is the title counts (as for covers), so this can only restore punctuation, case and accents.
    async name({ title }) { const found = await data(); return (found && launchbox.exact(found.games, title)?.game.name) || null; },
    async auto({ title }) {
      const found = await data(); if (!found) return null;
      const match = launchbox.exact(found.games, title); if (!match) return null;
      try { return { ...(await launchbox.fetchImage(found.games, match.game.id, match.picture.file, fetcher)), reference: match.game.id }; } catch { return null; }
    }
  });

  sources.set('xenia-manager', {
    id: 'xenia-manager', label: 'Xenia Manager', needsDownload: false,
    async status() { return { ready: true, built: 0, games: 0 }; },
    async prepare() { throw Error('This source needs no download'); },
    async search(title) { return (await manager.search(title)).map(game => ({ key: game.id, title: game.title, pictures: 1 })); },
    async pictures(key) { if (!(await manager.knows(key))) throw Error('Unknown cover selection'); return [{ key: 'boxart', label: 'Box art' }]; },
    async image(key, picture) { if (picture !== 'boxart') throw Error('Unknown picture'); return { bytes: await manager.download(key), mime: 'image/jpeg' }; },
    async name({ titleId }) { try { return await manager.nameOf(titleId); } catch { return null; } },
    async auto({ titleId }) {
      if (!titleId) return null;
      try { return { bytes: await manager.downloadTitle(titleId), mime: 'image/jpeg', reference: titleId }; } catch { return null; }
    }
  });
  // LaunchBox for native games: every platform, with the platform shown. Never used by the bulk download, because an
  // unattended match by name across every console picks the wrong game too often.
  sources.set('launchbox-all', {
    id: 'launchbox-all', label: 'LaunchBox', needsDownload: true,
    async status() { const found = await allData(); return { ready: !!found, built: found?.built || 0, games: found?.games.length || 0 }; },
    async prepare(onProgress) { await prepare(onProgress); return this.status(); },
    async search(title) { return launchbox.search(await needAll(), title).map(game => ({ key: game.id, title: game.title, platform: game.platform, pictures: game.pictures })); },
    async pictures(key) { return launchbox.pictures(await needAll(), key).map(picture => ({ key: picture.file, label: picture.label })); },
    async image(key, picture) { return launchbox.fetchImage(await needAll(), key, picture, fetcher); },
    async name() { return null; },
    async auto() { return null; }
  });
  return sources;
}
module.exports = { AUTO_MODES, NEEDS_DATA, create };
