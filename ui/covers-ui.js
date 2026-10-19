'use strict';
// The cover manager's screens. One flow for every source (see cover-sources.js): pick a source, find the game,
// pick a picture (with a preview), use it. It opens from two places — a game's own menu (Change cover) and Dashboard
// Settings › Game covers (the bulk download) — and is the only cover screen there is. It runs after renderer.js's
// helpers exist (modal, buttons, node, content, selected, mode, busy, api, openChoice …) and only calls them at use time.
const AUTO_MODES = [
  { value: 'launchbox', label: 'LaunchBox', needs: ['launchbox'] },
  { value: 'both', label: 'LaunchBox, then Xenia Manager', needs: ['launchbox', 'xenia-manager'] },
  { value: 'xenia-manager', label: 'Xenia Manager', needs: ['xenia-manager'] }
];
const SOURCE_NOTES = {
  launchbox: 'LaunchBox publishes its game database as one file of about 105 MB. It is downloaded once; only the Xbox 360 part (about 1 MB) is kept and the big file is deleted. After that, pictures are fetched one at a time.'
};
let cm = { context: null, sources: [], stage: 'home', source: null, games: [], pictures: [], game: null, query: '', manualQuery: false, preview: 0, timer: null, mode: 'launchbox' };
const coverDate = time => (time ? new Date(time).toISOString().slice(0, 10) : '');
const coverSourceInfo = id => cm.sources.find(source => source.id === id);
const coverNeedsData = source => !!source?.needs_download && !source.ready;
const coverModeInfo = () => AUTO_MODES.find(mode => mode.value === cm.mode) || AUTO_MODES.find(mode => mode.value === 'launchbox');

// context: { game: {id,title} | null, leave(): back to wherever this was opened from }
async function openCoverManager(context) {
  busy = true; errorDisplay.textContent = '';
  try {
    cm = { ...cm, context, sources: await api.coverSources(), stage: context.game ? 'home' : 'bulk', source: null, games: [], pictures: [], game: null, query: context.game?.title || '', manualQuery: false };
    renderCover();
  } catch (error) { errorDisplay.textContent = error.message; } finally { busy = false; }
}
function coverRows() {
  const { stage, sources } = cm;
  if (stage === 'home') return [{ action: 'local', label: 'Choose an image from this computer' }, ...sources.map(source => ({ action: 'source', source, label: `${source.label} covers (online)` })), { action: 'back', label: 'Return to game options' }];
  if (stage === 'setup') return [{ action: 'prepare', source: cm.source, label: `Download ${cm.source.label} data` }, { action: 'back', label: 'Return' }];
  if (stage === 'games') return [...(cm.source.id === 'launchbox' ? [{ action: 'search-query', label: `Search LaunchBox for: ${cm.query || 'Enter a game name'}` }] : []), ...cm.games.map(game => ({ action: 'game', game, label: `${game.title} (${game.pictures})` })), ...(cm.source.needs_download ? [{ action: 'prepare', source: cm.source, label: `Update ${cm.source.label} data` }] : []), { action: 'back', label: 'Return' }];
  if (stage === 'pictures') return [...cm.pictures.map(picture => ({ action: 'use', picture, label: picture.label })), { action: 'back', label: 'Back' }];
  // Source first, then its data, then the downloads, then the local scan. A source that needs no data has no data row.
  const data = coverModeInfo().needs.map(coverSourceInfo).filter(source => source?.needs_download);
  return [{ action: 'mode', label: `Source: ${coverModeInfo().label}` }, ...data.map(source => ({ action: 'prepare', source, label: `Update ${source.label} data` })), { action: 'auto-all', label: 'Download covers' }, { action: 'auto', label: 'Download missing covers' }, { action: 'rescan', label: 'Rescan local cover images' }, { action: 'back', label: 'Return' }];
}
function coverTitle() {
  const name = cm.context?.game?.title;
  return cm.stage === 'bulk' ? 'Game covers' : `${name} · Change cover`;
}
function renderCover(index = 0) {
  mode = 'covers'; const rows = coverRows(); selected = Math.min(index, rows.length - 1);
  modal(coverTitle(), 'D-pad: choose · A: select · B: return'); content.replaceChildren();
  buttons(rows.map(row => row.label), 'settings', activate);
  const list = content.firstElementChild; list.prepend(node('div', 'settings-highlight'));
  const shell = node('div', 'settings-shell'), details = node('div', 'settings-details'), preview = node('img', 'lb-preview');
  preview.alt = ''; details.append(node('div', 'detail-label'), node('div', 'setting-value'), node('p', 'setting-description'), preview);
  shell.append(list, details); content.append(shell); updateCoverDetails();
}
function sourceStatusText(source) {
  if (!source.needs_download) return 'Online · no download needed';
  return source.ready ? `Ready · ${source.games} Xbox 360 games · data from ${coverDate(source.built)}` : 'Not downloaded yet';
}
function updateCoverDetails() {
  const value = content.querySelector('.setting-value'); if (!value) return;
  const row = coverRows()[selected], lines = [], preview = content.querySelector('.lb-preview'), label = content.querySelector('.detail-label');
  preview.removeAttribute('src'); preview.style.display = 'none'; clearTimeout(cm.timer); cm.preview++;
  label.textContent = cm.source?.label || (cm.stage === 'bulk' ? 'Automatic download' : 'Cover');
  const { stage } = cm;
  if (stage === 'home') {
    if (row?.action === 'local') { value.textContent = 'This computer'; lines.push('Opens the file picker. JPEG, PNG or WebP; transparent PNGs keep their transparency. Only this game changes.'); }
    else if (row?.source) { label.textContent = row.source.label; value.textContent = sourceStatusText(row.source); lines.push('Search this source for the game, then choose one of its pictures. Only this game changes.'); }
  } else if (stage === 'setup') {
    value.textContent = 'Not downloaded yet'; lines.push(SOURCE_NOTES[cm.source.id] || 'This source needs a one-time download.');
  } else if (stage === 'games') {
    value.textContent = cm.games.length ? `${cm.games.length} possible match${cm.games.length === 1 ? '' : 'es'}` : 'No game found with this name';
    lines.push(cm.games.length ? 'Choose the game to see its pictures.' : `${cm.source.label} has no Xbox 360 game that matches this search.`);
    if (cm.source.id === 'launchbox') lines.push('Choose “Search LaunchBox for” to edit the game name used for this search.');
    if (cm.source.needs_download) lines.push(`\nData from ${coverDate(cm.source.built)} · ${cm.source.games} Xbox 360 games.`);
  } else if (stage === 'pictures') {
    value.textContent = row?.picture ? row.picture.label : cm.game.title;
    if (row?.picture) {
      lines.push('Press A to use this picture for this game only. Large pictures are scaled down; transparency is kept.');
      const token = cm.preview; preview.style.display = 'block';
      cm.timer = setTimeout(async () => {
        try { const url = await api.previewCover(cm.context.game.id, cm.source.id, cm.game.key, row.picture.key); if (token === cm.preview && mode === 'covers') preview.src = url; }
        catch (error) { if (token === cm.preview) errorDisplay.textContent = error.message; }
      }, 300);
    }
  } else {
    const missing = gamesList.filter(game => game.uses_fallback_art).length, info = coverModeInfo();
    if (row?.action === 'auto-all') { value.textContent = `${gamesList.length} game${gamesList.length === 1 ? '' : 's'}`; lines.push(`Replaces the cover of every game, using: ${info.label}. A game the source has no picture for keeps its current cover.`, 'This includes covers you chose yourself.'); }
    else if (row?.action === 'auto') { value.textContent = missing ? `${missing} game${missing === 1 ? '' : 's'} without a cover` : 'Every game has a cover'; lines.push(`Fills only the games that have no cover, using: ${info.label}. Covers you already have are never replaced.`, 'LaunchBox only takes a cover when the whole game name matches; the Xenia Manager database matches by title ID.'); }
    else if (row?.action === 'mode') { value.textContent = info.label; lines.push('Press A to choose where the automatic download looks. To change one game by hand (any source, with a preview), press Y on it and choose Change cover.'); }
    else if (row?.action === 'prepare') { value.textContent = sourceStatusText(row.source); lines.push(SOURCE_NOTES[row.source.id] || 'This source keeps a local copy of its data.', 'Download it again to get the newest covers.'); }
    else if (row?.action === 'rescan') { value.textContent = 'Local images'; lines.push('Looks again for cover images saved next to your games.'); }
  }
  content.querySelector('.setting-description').textContent = lines.join('\n');
  const button = selectableButtons()[selected], bar = content.querySelector('.settings-highlight');
  if (button && bar) { bar.style.height = `${button.offsetHeight}px`; bar.style.transform = `translateY(${button.offsetTop}px)`; }
}
function coverBack() {
  clearTimeout(cm.timer); cm.preview++;
  if (cm.stage === 'pictures') { cm.stage = 'games'; renderCover(); }
  else if (cm.stage === 'games' || cm.stage === 'setup') { cm.stage = 'home'; renderCover(); }
  else cm.context.leave();
  return true;
}
async function refreshCoverSources() { cm.sources = await api.coverSources(); cm.source = coverSourceInfo(cm.source?.id) || cm.source; }
async function openCoverSource(source) {
  cm.source = source;
  if (coverNeedsData(source)) { cm.stage = 'setup'; return renderCover(); }
  errorDisplay.textContent = 'Searching…'; cm.games = await api.searchCovers(cm.context.game.id, source.id, source.id === 'launchbox' && cm.manualQuery ? cm.query : undefined); errorDisplay.textContent = '';
  cm.stage = 'games'; renderCover();
}
async function searchLaunchBox(query, returnIndex) {
  const search = query.trim();
  if (!search) { errorDisplay.textContent = 'Enter a game name to search LaunchBox.'; return renderCover(returnIndex); }
  cm.query = search; cm.manualQuery = true; busy = true;
  try {
    errorDisplay.textContent = 'Searching LaunchBox…';
    cm.games = await api.searchCovers(cm.context.game.id, cm.source.id, search);
    cm.stage = 'games'; renderCover(0); errorDisplay.textContent = '';
  } catch (error) { cm.stage = 'games'; renderCover(0); errorDisplay.textContent = error.message; }
  finally { busy = false; }
}
async function activateCover() {
  const row = coverRows()[selected]; if (!row) return;
  if (row.action === 'back') return coverBack();
  if (row.action === 'search-query') {
    const returnIndex = selected;
    return editTextEntry({ title: 'Search LaunchBox', label: 'Game name', value: cm.query, maxLength: 120, onDone: query => searchLaunchBox(query, returnIndex), onCancel: () => renderCover(returnIndex) });
  }
  if (row.action === 'mode') return openChoice({ title: 'Source for the automatic download', text: 'LaunchBox needs its data downloaded once. It only takes a cover when the whole game name matches.', options: AUTO_MODES, current: cm.mode, onPick: value => { cm.mode = value; renderCover(0); } });
  busy = true;
  try {
    if (row.action === 'local') { const games = await api.chooseCoverFile(cm.context.game.id); if (games) { gamesList = games; renderCarousel(); errorDisplay.textContent = 'Cover changed.'; } }
    else if (row.action === 'source') await openCoverSource(row.source);
    else if (row.action === 'prepare') {
      errorDisplay.textContent = `Downloading ${row.source.label} data…`; await api.prepareCoverSource(row.source.id); await refreshCoverSources();
      if (cm.stage === 'bulk') { renderCover(selected); errorDisplay.textContent = `${row.source.label} data ready.`; }
      else { await openCoverSource(coverSourceInfo(row.source.id)); errorDisplay.textContent = `${row.source.label} data ready.`; }
    } else if (row.action === 'game') {
      errorDisplay.textContent = 'Loading pictures…'; cm.pictures = await api.coverPictures(cm.context.game.id, cm.source.id, row.game.key); cm.game = row.game; cm.stage = 'pictures'; renderCover(); errorDisplay.textContent = '';
    } else if (row.action === 'use') {
      errorDisplay.textContent = 'Downloading cover…'; gamesList = await api.applyCover(cm.context.game.id, cm.source.id, cm.game.key, row.picture.key); renderCarousel(); errorDisplay.textContent = 'Cover changed.';
    } else if (row.action === 'auto' || row.action === 'auto-all') {
      errorDisplay.textContent = 'Downloading covers…'; const result = await api.autoCovers(cm.mode, row.action === 'auto-all'); gamesList = result.games; renderCarousel(); renderCover(selected);
      errorDisplay.textContent = `${result.downloaded} cover${result.downloaded === 1 ? '' : 's'} downloaded${result.missing ? ` · ${result.missing} not found` : ''}.`;
    } else if (row.action === 'rescan') { gamesList = await api.rescanCovers(); renderCarousel(); renderCover(selected); status('Local cover images rescanned.'); }
  } catch (error) { errorDisplay.textContent = error.message; } finally { busy = false; }
}
const coverProgressText = progress => progress.kind === 'auto' ? `Downloading covers… ${progress.done} of ${progress.total}`
  : progress.received >= progress.total ? 'Reading the data… (a few seconds)' : `Downloading data… ${Math.floor(progress.received / progress.total * 100)}%`;
// wizardCoverNote: set while the Install Wizard downloads covers by itself; it shows the progress on its own card.
let wizardCoverNote = null;
function coverProgress(progress) {
  if (!busy || !progress.total) return;
  if (wizardCoverNote) return wizardCoverNote(coverProgressText(progress));
  if (mode === 'covers') errorDisplay.textContent = coverProgressText(progress);
}
