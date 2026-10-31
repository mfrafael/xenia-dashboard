'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const BASE = 'https://raw.githubusercontent.com/xenia-manager/x360db/main/';
function normalize(title) { return title.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
function matches(title, catalog) {
  const query = normalize(title);
  if (!query) return [];
  return catalog.map(g => {
    const name = normalize(g.title);
    const words = title.toLowerCase().split(/\W+/).filter(w => w.length > 2);
    const score = name === query ? 100 : name.length >= 4 && (name.includes(query) || query.includes(name)) ? 80 : words.filter(w => g.title.toLowerCase().includes(w)).length / Math.max(1, words.length) * 60;
    return { id: g.id, title: g.title.trim(), score };
  }).filter(g => g.score >= 30).sort((a,b) => b.score-a.score || a.title.localeCompare(b.title)).slice(0,8);
}
async function request(url, fetcher, limit) {
  const response = await fetcher(url, { signal: AbortSignal.timeout(20000), redirect: 'error' });
  if (!response.ok) throw new Error(`Artwork service returned ${response.status}. Try again later.`);
  const chunks = []; let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > limit) throw new Error('Artwork response is too large');
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
function createService(fetcher) {
  let catalog;
  async function loadCatalog() {
    if (!catalog) {
      const data = JSON.parse((await request(`${BASE}games.json`, fetcher, 16*1024*1024)).toString('utf8'));
      if (!Array.isArray(data)) throw new Error('Invalid artwork catalog');
      catalog = data.filter(g => typeof g.title === 'string' && /^[A-Fa-f0-9]{8}$/.test(g.id));
    }
    return catalog;
  }
  async function boxart(id) {
    const bytes = await request(`${BASE}titles/${id}/artwork/boxart.jpg`, fetcher, 8*1024*1024);
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) throw new Error('Artwork service did not return a JPEG cover');
    return bytes;
  }
  return {
    async search(title) { return matches(title, await loadCatalog()); },
    async knows(id) { return (await loadCatalog()).some(g => g.id === id); },
    async download(id) {
      if (!(await loadCatalog()).some(g => g.id === id)) throw new Error('Unknown cover selection');
      return boxart(id);
    },
    // Title IDs read from the game files identify the exact x360db entry, so no search is needed.
    // The catalogue's name for a title ID, or null.
    async nameOf(id) {
      if (typeof id !== 'string' || !/^[0-9A-F]{8}$/.test(id)) return null;
      return (await loadCatalog()).find(g => g.id.toUpperCase() === id)?.title || null;
    },
    async downloadTitle(id) {
      if (typeof id !== 'string' || !/^[0-9A-F]{8}$/.test(id)) throw new Error('Invalid title ID');
      return boxart(id);
    }
  };
}
async function applyCached(games, directory) {
  for (const game of games) {
    if (!game.uses_fallback_art) continue;
    // A saved cover is a .jpg (downloaded) or a .png (picked from a file, keeps transparency); a rescan must find both.
    for (const extension of ['jpg','png']) {
      const file = coverPath(directory,game.id,extension);
      try { await fs.access(file); game.cover_art_path = file; game.uses_fallback_art = false; break; } catch(error) { if(error.code !== 'ENOENT') throw error; }
    }
  }
  return games;
}
// Downloaded covers are JPEGs; a cover picked from a file keeps transparency, so it is stored as a PNG.
function coverPath(directory,id,extension='jpg'){if(typeof id!=='string'||! /^[a-zA-Z0-9_-]{1,64}$/.test(id))throw Error('Invalid game ID');if(!['jpg','png'].includes(extension))throw Error('Invalid cover type');return path.join(directory,`${id}.${extension}`);}
function isCachedCover(game,directory){try{return typeof game.cover_art_path==='string' && ['jpg','png'].some(extension=>path.resolve(game.cover_art_path)===path.resolve(coverPath(directory,game.id,extension)));}catch{return false;}}
module.exports = { createService, matches, applyCached,isCachedCover,coverPath,request };
