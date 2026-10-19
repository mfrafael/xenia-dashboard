'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createSectionRegistry } = require('../dashboard/sections');
const { createNavigator } = require('../dashboard/navigation');
const { createSkinRegistry, REQUIRED, BOOTS } = require('../dashboard/skin');
const { registerLibrarySection } = require('../sections/library');
const { dashboardScripts, loadDashboard } = require('./helpers/dashboard');
const { APP_FILES, appFile } = require('../src/local-assets');
const { build } = require('../package.json');
// build.files holds globs: a file is packaged when one of them covers it.
const packaged = file => build.files.some(glob => glob === file || (glob.endsWith('/**/*') && file.startsWith(glob.slice(0, -4))));

const section = (id, extra = {}) => ({ id, label: id.toUpperCase(), kind: 'rail', items: () => [], ...extra });

test('section registry validates definitions, rejects duplicates and orders by order then id', () => {
  const registry = createSectionRegistry();
  registry.register(section('xenia', { order: 20 })).register(section('library', { order: 10 })).register(section('dashboard', { order: 20 }));
  assert.deepEqual(registry.ids(), ['library', 'dashboard', 'xenia']);
  assert.equal(registry.get('nope'), null);
  assert.equal(registry.register(section('extra')).get('extra').order, 100, 'sections default to the end of the list');
  assert.throws(() => registry.register(section('library')), /already registered/);
  assert.throws(() => registry.register(section('Bad Id')), /lowercase id/);
  assert.throws(() => registry.register(section('x', { label: '' })), /label/);
  assert.throws(() => registry.register(section('x', { kind: 'carousel' })), /kind/);
  assert.throws(() => registry.register({ id: 'x', label: 'X', kind: 'rail' }), /items/);
  assert.throws(() => registry.register(section('x', { activate: 'go' })), /activate must be a function/);
});

test('navigator moves inside a section, jumps by five, clamps and remembers each section', () => {
  const registry = createSectionRegistry().register(section('library', { order: 1 })).register(section('xenia', { order: 2 }));
  const sizes = { library: 12, xenia: 3 };
  const nav = createNavigator({ sections: registry, count: id => sizes[id] });
  assert.equal(nav.section, 'library');
  assert.deepEqual(nav.dispatch('right'), { type: 'move', section: 'library', from: 0, to: 1, delta: 1 });
  assert.equal(nav.dispatch('left').to, 0);
  assert.equal(nav.dispatch('left'), null, 'clamped at the start: no effect, no sound');
  assert.equal(nav.dispatch('rb').to, 5);
  assert.equal(nav.dispatch('rb').to, 10);
  assert.equal(nav.dispatch('rb').to, 11);
  assert.equal(nav.dispatch('rb'), null);
  assert.equal(nav.dispatch('lb').to, 6);
  assert.deepEqual(nav.dispatch('down'), { type: 'section', from: 'library', to: 'xenia', direction: 'down' });
  assert.deepEqual(nav.dispatch('down'), { type: 'section', from: 'xenia', to: 'library', direction: 'down' }, 'down from the last section wraps to the first');
  assert.deepEqual(nav.dispatch('up'), { type: 'section', from: 'library', to: 'xenia', direction: 'up' }, 'up from the first section wraps to the last');
  assert.equal(nav.dispatch('right').to, 1);
  assert.equal(nav.dispatch('up').to, 'library');
  assert.equal(nav.index(), 6, 'library focus is remembered while away');
  assert.equal(nav.index('xenia'), 1);
});

test('the navigator picks its first section lazily, so sections can register after it', () => {
  const registry = createSectionRegistry();
  const nav = createNavigator({ sections: registry, count: () => 4 });
  assert.equal(nav.section, null);
  registry.register(section('library'));
  assert.equal(nav.section, 'library');
  assert.equal(nav.dispatch('right').to, 1);
});

test('navigator reports buttons as effects and tolerates empty or unknown sections', () => {
  const registry = createSectionRegistry().register(section('library'));
  let size = 0;
  const nav = createNavigator({ sections: registry, count: () => size });
  assert.equal(nav.dispatch('right'), null);
  assert.deepEqual(nav.dispatch('a'), { type: 'activate', section: 'library', index: 0 });
  assert.equal(nav.dispatch('y').type, 'menu');
  assert.equal(nav.dispatch('b').type, 'back');
  assert.deepEqual(nav.dispatch('x'), { type: 'alt', section: 'library', index: 0 });
  assert.equal(nav.dispatch('up'), null, 'a single section has nowhere to go');
  assert.equal(nav.dispatch('down'), null);
  size = 3; nav.setIndex('library', 99); assert.equal(nav.index(), 2);
  size = 1; assert.equal(nav.reclamp(), 0);
  assert.throws(() => nav.focusSection('missing'), /Unknown section/);
  assert.equal(createNavigator({ sections: createSectionRegistry(), count: () => 0 }).dispatch('a'), null);
});

test('skins must implement the whole contract before they can be used', () => {
  const skins = createSkinRegistry();
  const complete = { name: 'blades', ...Object.fromEntries(Object.keys(REQUIRED).map(method => [method, () => {}])) };
  assert.throws(() => skins.register({ name: 'half', mount() {} }), /missing: .*applyTheme/);
  assert.throws(() => skins.register({}), /needs a name/);
  assert.throws(() => skins.use('blades'), /Unknown skin/);
  skins.register(complete);
  assert.equal(skins.use('blades'), complete);
  assert.deepEqual(skins.names(), ['blades']);
  const { createNxeSkin } = require('../skins/nxe/nxe-skin');
  assert.doesNotThrow(() => createSkinRegistry().register(createNxeSkin()));
});

test('the Game Library section words captions the same way for every skin', () => {
  const registry = createSectionRegistry(), asked = [];
  let disc = null, total = 3;
  const games = [{ id: 'a', title: 'Alpha', cover_art_path: 'kratos-art://cover/a', uses_fallback_art: false }, { id: 'b', title: 'Beta', uses_fallback_art: true, discs: [{ id: 'b1', title: 'Disc 1' }, { id: 'b2', title: 'Disc 2' }] }];
  registerLibrarySection(registry, { games: () => disc ? disc.game.discs : games, total: () => total, disc: () => disc, launch() {}, options() {}, settings: game => asked.push(game.id), leaveDiscs() {} });
  const library = registry.get('library'), items = library.items();
  assert.deepEqual(items.map(item => [item.title, item.art, item.badge]), [['Alpha', 'kratos-art://cover/a', null], ['Beta', null, '2 discs']]);
  assert.deepEqual(library.caption(items, 0), { title: 'Alpha', heading: 'Game Library', subtitle: 'Press A to Launch', counter: '1 of 2', empty: false });
  assert.equal(library.caption(items, 1).subtitle, 'Press A to Choose Disc');
  library.alt(items[0]); assert.deepEqual(asked, ['a'], "X opens that game's settings");
  disc = { game: games[1] };
  const discs = library.items();
  assert.deepEqual(discs.map(item => item.badge), ['Disc 1', 'Disc 2']);
  assert.deepEqual(library.caption(discs, 1), { title: 'Disc 2', heading: 'Beta · Choose disc', subtitle: 'A: Launch selected disc · B: Return to Game Library', counter: '2 of 2 discs', empty: false });
  disc = null; total = 0;
  assert.deepEqual(library.caption([], 0), { title: 'No Games Found', heading: 'Game Library', subtitle: 'Choose your ROM folder in Xenia Settings › Folders', counter: '0 games', empty: true });
});

test('every script in index.html exists, is served by the app protocol and is packaged', () => {
  const scripts = dashboardScripts();
  assert.ok(scripts.includes('ui/renderer.js') && scripts.indexOf('dashboard/navigation.js') < scripts.indexOf('ui/renderer.js'));
  for (const file of scripts) {
    assert.ok(fs.existsSync(path.join(__dirname, '..',file)), `${file} is referenced by index.html but missing`);
    assert.ok(APP_FILES.has(file), `${file} is not in APP_FILES (blocked by nxe-app://)`);
    assert.ok(packaged(file), `${file} is missing from build.files`);
  }
});

test('the wired dashboard moves focus, plays cues and routes buttons through the layers', () => {
  const played = [], launched = [], texts = {};
  class Element {
    constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.style = { removeProperty() {}, setProperty() {} }; this.classList = { toggle() {}, add() {}, remove() {} }; this.offsetWidth = 100; }
    append(...c) { this.children.push(...c); } replaceChildren(...c) { this.children = c; } setAttribute() {} addEventListener() {}
    cloneNode(deep) { const copy = new Element(this.tagName); copy.src = this.src; if (deep) copy.children = this.children.map(c => c.cloneNode(true)); return copy; }
  }
  const byId = {};
  const document = { getElementById: id => byId[id] ||= new Element('div'), createElement: tag => new Element(tag) };
  byId['section-hint'] = new Element('span');
  const window = { electronAPI: { launchXeniaGame: async id => launched.push(id) }, addEventListener() {}, matchMedia: () => ({ matches: false }), uiSounds: { play: cue => played.push(cue) } };
  const context = vm.createContext({ window, document, requestAnimationFrame() {}, navigator: {}, setTimeout, clearTimeout });
  loadDashboard(vm, context, `
    gamesList=[{id:'a',title:'Alpha',uses_fallback_art:true},{id:'b',title:'Beta',uses_fallback_art:true},{id:'c',title:'Gamma',uses_fallback_art:true}];
    renderCarousel();`);
  const caption = () => vm.runInContext('(() => { const s = sections.get(nav.section), items = s.items(); return s.caption(items, nav.index(s.id)); })()', context);
  const title = () => caption().title;
  Object.defineProperty(byId, 'counter', { get: () => ({ textContent: caption().counter }) });
  Object.defineProperty(byId, 'subtitle', { get: () => ({ textContent: caption().subtitle }) });
  assert.equal(title(), 'Alpha');
  vm.runInContext("input('right')", context); assert.equal(title(), 'Beta');
  vm.runInContext("input('rb')", context); assert.equal(title(), 'Gamma');
  vm.runInContext("input('right')", context);
  assert.equal(title(), 'Gamma');
  assert.deepEqual(played, ['right', 'right'], 'clamped moves stay silent');
  vm.runInContext("input('a')", context);
  assert.deepEqual(launched, ['c']);
  assert.equal(byId.counter.textContent, '3 of 3');
  vm.runInContext('busy=false', context); // the emulator "closed"
  // Sections: down leaves the library for Xenia, tiles move sideways, up comes back to the same game.
  vm.runInContext("input('down')", context);
  assert.equal(vm.runInContext('nav.section', context), 'xenia');
  assert.equal(title(), 'System');
  assert.equal(byId.counter.textContent, '1 of 6');
  vm.runInContext("input('right');input('right');input('right');input('right')", context); assert.equal(title(), 'Games');
  assert.equal(byId.subtitle.textContent, 'Settings, patches and details for one game');
  vm.runInContext("input('down')", context); assert.equal(vm.runInContext('nav.section', context), 'dashboard');
  vm.runInContext("input('down')", context); assert.equal(vm.runInContext('nav.section', context), 'library', 'the list is a ring');
  assert.equal(title(), 'Gamma'); assert.equal(byId.counter.textContent, '3 of 3');
  vm.runInContext("input('up')", context); assert.equal(vm.runInContext('nav.section', context), 'dashboard', 'up from the first section wraps to the last');
  vm.runInContext("input('up');input('up')", context);
  assert.equal(title(), 'Gamma'); assert.equal(byId.counter.textContent, '3 of 3');
  assert.deepEqual(played.filter(cue => /^slide/.test(cue)), ['slide2', 'slide3', 'slide1', 'slide3', 'slide2', 'slide1'], 'each section arrived at has its own slide sound, by position');
  assert.ok(!played.includes('focus'), 'moving between sections never plays the menu sound');
  // A tile asks for the admin session first and remembers where to go once it is granted.
  vm.runInContext("openPin=()=>{};input('down');input('a')", context);
  assert.equal(vm.runInContext('typeof entryAfterUnlock', context), 'function');
  // Leaving a multi-disc game is required before changing section.
  vm.runInContext("entryAfterUnlock=null;input('up');gamesList=[{id:'m',title:'Multi',uses_fallback_art:true,discs:[{id:'m1',title:'Disc 1'},{id:'m2',title:'Disc 2'}]}];renderCarousel();input('a')", context);
  assert.equal(title(), 'Disc 1');
  vm.runInContext("input('down')", context); assert.equal(vm.runInContext('nav.section', context), 'library');
  vm.runInContext("input('b')", context); assert.equal(title(), 'Multi');
});

test('settings sections list real tiles and route them through ctx.enter', () => {
  const registry = createSectionRegistry(), entered = [];
  require('../sections/settings').registerSettingsSections(registry, { enter: name => entered.push(name) });
  assert.deepEqual(registry.ids(), ['xenia', 'dashboard']);
  const xenia = registry.get('xenia'), dashboard = registry.get('dashboard');
  assert.equal(xenia.kind, 'tiles');
  assert.deepEqual(xenia.items().map(item => item.id), ['system', 'locations', 'updates', 'profiles', 'games', 'advanced']);
  assert.deepEqual(dashboard.items().map(item => item.id), ['themes', 'sound', 'covers', 'security', 'wizard', 'exit']);
  const tile = (section, id) => section.items().find(item => item.id === id);
  xenia.activate(tile(xenia, 'profiles')); dashboard.activate(tile(dashboard, 'exit'));
  assert.deepEqual(entered, ['xenia:profiles', 'dashboard:exit']);
  assert.deepEqual(xenia.caption(xenia.items(), 4), { title: 'Games', heading: 'Xenia Settings', subtitle: 'Settings, patches and details for one game', counter: '5 of 6', empty: false });
  for (const section of [xenia, dashboard]) assert.ok(!section.items().some((item, position, all) => item.id === 'advanced' && position !== all.length - 1), 'Advanced is always the last tile');
  for (const section of [xenia, dashboard]) for (const item of section.items()) assert.ok(item.hint && item.title && item.icon, `${section.id}/${item.id} needs a title, hint and icon`);
});

function guideHarness() {
  const played = [], listeners = {};
  class Element {
    constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.hidden = true; this.textContent = ''; this.className = ''; this.dataset = {}; this.style = { removeProperty() {}, setProperty() {} }; const self = this; this.classList = { toggle() {}, add(name) { if (name === 'hidden') self.hidden = true; }, remove(name) { if (name === 'hidden') self.hidden = false; } }; }
    append(...c) { this.children.push(...c); } replaceChildren(...c) { this.children = c; } setAttribute() {} addEventListener() {}
    cloneNode() { return new Element(this.tagName); } querySelectorAll() { return []; } scrollIntoView() {}
  }
  const byId = {};
  const document = { body: new Element('body'), querySelector: () => new Element('div'), createTextNode: text => ({ textContent: text }), getElementById: id => byId[id] ||= new Element('div'), createElement: tag => new Element(tag) };
  const window = { electronAPI: { lockAdmin: async () => {} }, addEventListener(name, callback) { listeners[name] = callback; }, matchMedia: () => ({ matches: false }), uiSounds: { play: cue => played.push(cue) } };
  const context = vm.createContext({ window, document, requestAnimationFrame() {}, navigator: {}, setTimeout, clearTimeout });
  loadDashboard(vm, context, "gamesList=[{id:'a',title:'Alpha',uses_fallback_art:true}];renderCarousel();openPin=()=>{};renderXeniaItems=()=>{};");
  const run = code => vm.runInContext(code, context);
  return { played, run, byId,
    labels: () => byId['guide-buttons'].children.map(button => button.textContent),
    selectedLabel: () => byId['guide-buttons'].children.find(button => button.className === 'selected').textContent,
    key: (name, extra = {}) => listeners.keydown({ key: name, target: { tagName: 'BODY' }, preventDefault() {}, ...extra }) };
}

test('the Guide (SELECT/Esc) lists every real section, Profiles and Exit, opens on the current section and jumps where asked', () => {
  const { run, byId, labels, selectedLabel, key, played } = guideHarness();
  const choose = label => { const index = labels().findIndex(text => text.replace('✓ ', '') === label); assert.ok(index >= 0, `${label} is in the menu`); run(`dialog.focus=${index};input('a')`); };
  run('openGuide()');
  assert.equal(run('mode'), 'dialog'); assert.equal(byId['guide-dialog'].hidden, false);
  assert.equal(byId['guide-title'].textContent, 'Xenia Dashboard');
  assert.deepEqual(labels(), ['✓ Game Library', 'Xenia Settings', 'Dashboard Settings', 'Profiles', 'Exit to desktop'], 'sections come from the registry; the current one is marked; there is no Resume (B does that)');
  assert.equal(selectedLabel(), '✓ Game Library', 'it opens on the current section');
  run("input('a')"); assert.equal(run('mode'), 'library'); assert.equal(byId['guide-dialog'].hidden, true); assert.equal(run('nav.section'), 'library', 'a stray A changes nothing');

  key('Escape'); assert.equal(run('mode'), 'dialog', 'Esc opens the Guide from the dashboard');
  run("input('b')"); assert.equal(run('mode'), 'library', 'B closes it');
  key('Escape'); key('Escape'); assert.equal(run('mode'), 'library', 'Esc again closes it');

  run('openGuide()'); choose('Xenia Settings');
  assert.equal(run('nav.section'), 'xenia'); assert.equal(run('mode'), 'library');
  run('openGuide()'); assert.deepEqual(labels(), ['Game Library', '✓ Xenia Settings', 'Dashboard Settings', 'Profiles', 'Exit to desktop']); assert.equal(selectedLabel(), '✓ Xenia Settings');
  choose('Dashboard Settings'); assert.equal(run('nav.section'), 'dashboard');
  run('openGuide()'); choose('Game Library'); assert.equal(run('nav.section'), 'library', 'jumping to the first section from the last');
  run('openGuide()'); choose('Profiles');
  assert.equal(run('nav.section'), 'xenia'); assert.equal(run('nav.index("xenia")'), 3, 'lands on the Profiles tile');
  assert.equal(run('unlockSection'), 'xenia'); assert.equal(run('typeof entryAfterUnlock'), 'function');
  run("entryAfterUnlock=null;unlockSection=undefined;");
  assert.ok(played.includes('open') && played.some(cue => /^slide/.test(cue)) && played.includes('select') && played.includes('back'));
});

test('the Guide opens from a settings screen (closing it) but not while typing, entering a PIN, in a game or in a disc list', () => {
  const { run, byId, labels, key } = guideHarness();
  const choose = label => { const index = labels().findIndex(text => text.replace('✓ ', '') === label); run(`dialog.focus=${index};input('a')`); };
  run("mode='xenia-items'"); run('openGuide()'); assert.equal(run('mode'), 'dialog', 'a settings screen is left first');
  run("closeDialog(false)");
  for (const typing of ['keyboard', 'pin']) { run(`mode='${typing}'`); run('openGuide()'); assert.equal(run('mode'), typing, `not while ${typing}`); }
  run("mode='library';busy=true;openGuide()"); assert.equal(run('mode'), 'library', 'not while a game runs');
  run("busy=false;discView={game:{discs:[]},returnIndex:0}");
  key('Escape'); assert.equal(run('mode'), 'library', 'in a disc list Esc does not open it');
  run("discView=null;openGuide()"); choose('Xenia Settings'); assert.equal(run('nav.section'), 'xenia');
  run("nav.focusSection('library');discView={game:{discs:[{id:'d',title:'Disc 1',uses_fallback_art:true}],title:'Multi'},returnIndex:0};renderCarousel();openGuide()"); choose('Dashboard Settings');
  assert.equal(run('discView'), null, 'jumping away leaves the disc list');
  assert.equal(byId['guide-dialog'].hidden, true);
});

test('Exit to desktop in the Guide asks once more; Cancel is the safe default; confirming goes through the Dashboard lock', () => {
  const { run, byId, labels, selectedLabel, played } = guideHarness();
  run("openGuide();dialog.focus=dialog.choices.length-1;input('a')");   // Exit to desktop is the last entry
  assert.equal(run('mode'), 'dialog'); assert.equal(byId['guide-title'].textContent, 'Exit Xenia Dashboard?');
  assert.deepEqual(labels(), ['Cancel', 'Exit to desktop']); assert.equal(selectedLabel(), 'Cancel', 'a stray A press must not quit');
  run("input('a')"); assert.equal(run('mode'), 'library'); assert.equal(run('entryAfterUnlock'), null);
  run("openExitDialog();input('down')"); assert.equal(selectedLabel(), 'Exit to desktop');
  run("input('up')"); assert.equal(selectedLabel(), 'Cancel');
  run("input('right');input('right')"); assert.equal(selectedLabel(), 'Exit to desktop', 'clamped at the last button');
  run("input('a')");
  assert.equal(run('mode'), 'library');
  assert.equal(run('unlockSection'), 'dashboard', 'quitting needs the Dashboard session (and its PIN lock)');
  assert.equal(run('typeof entryAfterUnlock'), 'function');
  run("entryAfterUnlock=null;unlockSection=undefined");
  run("busy=true;openExitDialog()"); assert.equal(run('mode'), 'library', 'not while a game runs');
  run("busy=false;enterFromDashboard('dashboard:exit')"); assert.equal(run('mode'), 'dialog', 'the Dashboard Settings tile opens the confirmation directly');
  assert.ok(played.includes('open') && played.includes('select'));
});

test('a window-close request shows the exit window, leaving any open screen first', () => {
  class Element { constructor(t) { this.tagName = t; this.children = []; this.textContent = ''; this.style = { removeProperty() {}, setProperty() {} }; this.classList = { toggle() {}, add() {}, remove() {} }; } append(...c) { this.children.push(...c); } replaceChildren(...c) { this.children = c; } setAttribute() {} addEventListener() {} cloneNode() { return new Element(this.tagName); } }
  const byId = {}, document = { body: new Element('body'), getElementById: id => byId[id] ||= new Element('div'), createElement: t => new Element(t) };
  const context = vm.createContext({ window: { electronAPI: { lockAdmin: async () => {} }, addEventListener() {}, matchMedia: () => ({ matches: false }), uiSounds: { play() {} } }, document, requestAnimationFrame() {}, navigator: {}, setTimeout, clearTimeout });
  loadDashboard(vm, context, "gamesList=[{id:'a',title:'A',uses_fallback_art:true}];renderCarousel();");
  const run = code => vm.runInContext(code, context);
  run('handleCloseRequest()'); assert.equal(run('mode'), 'dialog');
  run('handleCloseRequest()'); assert.equal(run('mode'), 'dialog', 'asking again does not stack windows');
  run("input('b')");
  run("mode='settings'"); run('handleCloseRequest()'); assert.equal(run('mode'), 'dialog', 'an open settings screen is closed first');
  run("input('b');busy=true"); run('handleCloseRequest()'); assert.equal(run('mode'), 'library', 'not while a game runs');
});

test('the section column lists only real sections, in the order the arrows move through them', () => {
  const { fakeDocument } = require('./helpers/fake-dom');
  const saved = [globalThis.document, globalThis.addEventListener];
  Object.assign(globalThis, { document: fakeDocument(), addEventListener() {} });
  try {
    const skin = require('../skins/nxe/nxe-skin').createNxeSkin();
    skin.mount({});
    const column = document.body.children[0].find('nv-channels');
    const lines = () => column.children.map(node => node.className.includes('nv-open') ? `[${node.children[1].textContent}]` : node.textContent);
    const labels = names => names.map(label => ({ id: label.toLowerCase(), label }));
    skin.showSections({ sections: labels(['Game Library', 'Xenia', 'Dashboard']), active: 0 });
    assert.deepEqual(lines(), ['Xenia', 'Dashboard', '[Game Library]'], 'only the channels passed, above the open one; no invented lines');
    skin.showSections({ sections: labels(['Game Library', 'Xenia', 'Dashboard']), active: 1 });
    assert.deepEqual(lines(), ['Dashboard', 'Game Library', '[Xenia]']);
    skin.showSections({ sections: labels(['A', 'B']), active: 0 });
    assert.deepEqual(lines(), ['B', '[A]'], 'with two sections the other one is listed once');
    skin.showSections({ sections: labels(['A', 'B', 'C', 'D', 'E', 'F']), active: 0 });
    assert.deepEqual(lines(), ['C', 'D', 'E', 'F', '[A]'], 'four at most');
    skin.showSections({ sections: labels(['Only']), active: 0 });
    assert.deepEqual(lines(), ['[Only]'], 'a single section has nothing around it');
    // The label right above is exactly where ↑ goes.
    const registry = createSectionRegistry();
    for (const [order, name] of ['Game Library', 'Xenia', 'Dashboard'].entries()) registry.register(section(name.toLowerCase().replace(' ', '-'), { label: name, order }));
    for (let start = 0; start < 3; start++) {
      const nav = createNavigator({ sections: registry, count: () => 1 });
      nav.focusSection(registry.ids()[start]);
      skin.showSections({ sections: registry.list().map(({ id, label }) => ({ id, label })), active: start });
      assert.equal(registry.get(nav.dispatch('up').to).label, lines().at(-2), 'up goes to the label shown right above');
    }
  } finally { [globalThis.document, globalThis.addEventListener] = saved; }
});

test('A on anything with options opens a menu of every option instead of cycling; arrows stay a quick step', () => {
  class Element { constructor(t) { this.tagName = t; this.className = ''; this.children = []; this.textContent = ''; this.style = { removeProperty() {}, setProperty() {} }; this.classList = { toggle() {}, add() {}, remove() {} }; } append(...c) { this.children.push(...c); } replaceChildren(...c) { this.children = c; } setAttribute() {} addEventListener() {} cloneNode() { return new Element(this.tagName); } querySelectorAll() { return []; } scrollIntoView() {} }
  const byId = {}, document = { body: new Element('body'), getElementById: id => byId[id] ||= new Element('div'), createElement: t => new Element(t) };
  const calls = [];
  const api = { setSound: async (kind, value) => { calls.push(['sound', kind, value]); return null; }, setBootAnimation: async value => { calls.push(['boot', value]); return null; }, selectTheme: async id => { calls.push(['theme', id]); return null; }, setSkin: async name => { calls.push(['skin', name]); return null; }, setAnimations: async m => { calls.push(['animations', m]); return null; }, setPinProtection: async v => { calls.push(['pin', v]); return { pin_required: v }; }, setSectionLock: async (s, v) => { calls.push(['lock', s, v]); return { locked_sections: v ? [s] : [] }; } };
  const context = vm.createContext({ window: { electronAPI: api, addEventListener() {}, matchMedia: () => ({ matches: false }), uiSounds: { play() {} } }, document, requestAnimationFrame() {}, navigator: {}, setTimeout, clearTimeout });
  loadDashboard(vm, context, "gamesList=[];renderCarousel();");
  const run = code => vm.runInContext(code, context);
  const labels = () => byId['guide-buttons'].children.map(button => button.textContent);
  const focused = () => byId['guide-buttons'].children.findIndex(button => button.className === 'selected');

  // Xenia setting with a list: the menu shows all of it, marks and focuses the current value.
  run(`saveXenia=(item,value)=>globalThis.saved=[item.id,value];
    xeniaView={categories:[{id:'c',label:'C',description:'',items:[{id:'Console.user_language',label:'Language',type:'int',value:1,description:'User language ID.\\nMore words.',step:1,options:[{value:1,label:'English'},{value:2,label:'Japanese'},{value:9,label:'Portuguese'}]}]}],advanced:[]};
    xeniaPath={kind:'category',id:'c'};mode='xenia-items';selected=0;`);
  run('activate()');
  assert.equal(run('mode'), 'dialog');
  assert.deepEqual(labels(), ['✓ English', 'Japanese', 'Portuguese']);
  assert.equal(byId['guide-title'].textContent, 'Language'); assert.equal(byId['guide-text'].textContent, 'User language ID.');
  assert.equal(focused(), 0);
  run("input('down');input('down');input('a')");
  assert.deepEqual(Array.from(run('saved')), ['Console.user_language', 9]);
  assert.equal(run('mode'), 'xenia-items', 'the screen it was opened from comes back');
  // B cancels without changing anything.
  run("saved=null;activate();input('down');input('b')");
  assert.equal(run('mode'), 'xenia-items'); assert.equal(run('saved'), null);
  // Choosing the value it already has changes nothing.
  run("activate();input('a')"); assert.equal(run('saved'), null);
  // Booleans open On / Off too, with the current one focused.
  run(`xeniaView.categories[0].items[0]={id:'Display.fullscreen',label:'Fullscreen',type:'bool',value:false,description:'x',step:1,options:[{value:true,label:'On'},{value:false,label:'Off'}]};activate();`);
  assert.deepEqual(labels(), ['On', '✓ Off']); assert.equal(focused(), 1);
  run("input('up');input('a')"); assert.deepEqual(Array.from(run('saved')), ['Display.fullscreen', true]);
  // A number with a range and a step becomes a menu of its steps (the current value is kept even off the grid).
  run(`xeniaView.categories[0].items[0]={id:'APU.volume',label:'Master volume',type:'int',value:35,min:0,max:100,step:5,description:'x',options:[]};activate();`);
  assert.equal(labels().length, 21); assert.equal(labels()[7], '✓ 35'); assert.equal(focused(), 7);
  run("input('down');input('a')"); assert.deepEqual(Array.from(run('saved')), ['APU.volume', 40]);
  run(`xeniaView.categories[0].items[0]={id:'HID.left_stick_deadzone_percentage',label:'Left stick deadzone',type:'float',value:0.15,min:0,max:1,step:0.05,description:'x',options:[]};activate();`);
  assert.equal(labels()[3], '✓ 15%'); input_ok(); 
  function input_ok() { run("input('b')"); }
  run(`xeniaView.categories[0].items[0]={id:'Memory.big',label:'Huge range',type:'int',value:1,min:0,max:100000,step:1,description:'x',options:[]};renderKeyboard=()=>{};modal=()=>{};activate();`);
  assert.equal(run('mode'), 'keyboard', 'too many steps for a menu: type it');
  run("mode='xenia-items'");
  // Free text and numbers without a list still open the keyboard.
  run(`xeniaView.categories[0].items[0]={id:'Storage.content_root',label:'Content folder',type:'string',value:'',description:'x',step:1,options:[]};renderKeyboard=()=>{};modal=()=>{};activate();`);
  assert.equal(run('mode'), 'keyboard');

  // Security rows: PIN protection and the locks are menus, too.
  run("closeDialog=closeDialog;settings={admin_pin_required:true,locked_sections:['xenia','dashboard']};renderSettings=()=>{};activeRows=SECURITY_ROWS;mode='settings';selected=1;");
  run('activate()');
  assert.equal(byId['guide-title'].textContent, 'PIN protection'); assert.deepEqual(labels(), ['✓ On', 'Off']);
  run("input('down');input('a')");
  return new Promise(resolve => setImmediate(resolve)).then(() => {
    assert.deepEqual(calls.at(-1), ['pin', false]);
    assert.equal(run('mode'), 'settings');
    run("selected=2;activate()");
    assert.equal(byId['guide-title'].textContent, 'Lock Xenia Settings'); assert.equal(focused(), 0);
    run("input('down');input('a')");
    return new Promise(resolve => setImmediate(resolve));
  }).then(() => {
    assert.deepEqual(calls.at(-1), ['lock', 'xenia', false]);
    // Sound and animations: volume, music, sound effects, animations and the boot animation list their choices.
    run("themeState={backgrounds:[],selected:null,audio:{volume:.5},sound:{music:true,effects:true},boot_animation:'theme'};renderSound=()=>{};applyTheme=()=>{};themeRows=[{key:'volume'},{key:'music'},{key:'effects'},{key:'animations'},{key:'boot'},{key:'return'}];mode='sound';selected=0;activateSound()");
    assert.equal(byId['guide-title'].textContent, 'Sound volume'); assert.deepEqual(labels(), ['0%', '25%', '✓ 50%', '75%', '100%']);
    run("input('down');input('down');input('a')");
    return new Promise(resolve => setImmediate(resolve));
  }).then(() => {
    assert.deepEqual(calls.at(-1), ['sound', 'volume', 1]);
    run("mode='sound';selected=1;activateSound()");
    assert.equal(byId['guide-title'].textContent, 'Music'); assert.deepEqual(labels(), ['✓ On', 'Off']);
    run("input('b')");
    run("mode='sound';selected=2;activateSound()");
    assert.equal(byId['guide-title'].textContent, 'Sound effects'); assert.deepEqual(labels(), ['✓ On', 'Off']);
    run("input('down');input('a')");
    return new Promise(resolve => setImmediate(resolve));
  }).then(() => {
    assert.deepEqual(calls.at(-1), ['sound', 'effects', false]);
    run("mode='sound';selected=3;activateSound()");
    assert.equal(byId['guide-title'].textContent, 'Animations'); assert.deepEqual(labels(), ['✓ On', 'Follow system', 'Off']);
    run("input('down');input('a')");
    return new Promise(resolve => setImmediate(resolve));
  }).then(() => {
    assert.deepEqual(calls.at(-1), ['animations', 'system']);
    run("mode='sound';selected=4;activateSound()");
    assert.equal(byId['guide-title'].textContent, 'Boot animation'); assert.deepEqual(labels(), ['✓ Follow the view', 'Off', 'Blades / NXE (2005-2011)', 'Kinect / Metro (2011-2012)']);
    run("input('down');input('down');input('a')");
    return new Promise(resolve => setImmediate(resolve));
  }).then(() => {
    assert.deepEqual(calls.at(-1), ['boot', 'classic']);
    // Notification time: A lists 0 to 5 s in half-second steps; ← / → on the row change it by half a second.
    run("themeState={...themeState,notice_seconds:2};themeRows=[{key:'volume'},{key:'music'},{key:'effects'},{key:'animations'},{key:'boot'},{key:'notice'},{key:'return'}];mode='sound';selected=5;activateSound()");
    assert.equal(byId['guide-title'].textContent, 'Notification time');
    assert.deepEqual(labels(), ['Off', '0.5 s', '1 s', '1.5 s', '✓ 2 s', '2.5 s', '3 s', '3.5 s', '4 s', '4.5 s', '5 s']);
    run("input('b')");
    run("mode='sound';selected=5;input('right')");
    return new Promise(resolve => setImmediate(resolve));
  }).then(() => {
    assert.deepEqual(calls.at(-1), ['sound', 'notice_seconds', 2.5], 'right: half a second more');
    run("themeState={...themeState,notice_seconds:2.5};mode='sound';selected=5;input('left');input('left')");
    return new Promise(resolve => setImmediate(resolve));
  }).then(() => new Promise(resolve => setImmediate(resolve))).then(() => {
    assert.deepEqual(calls.at(-1), ['sound', 'notice_seconds', 2], 'left: half a second less');
    const before=calls.length;run("themeState={...themeState,notice_seconds:5};mode='sound';selected=5;input('right')");
    run("themeState={...themeState,notice_seconds:0};input('left')");
    assert.equal(calls.length,before+0,'at the ends nothing changes');
    run("mode='sound';selected=0;input('right')");assert.equal(calls.length,before+0,'on other rows ← → do not touch the notification time');
    return new Promise(resolve => setImmediate(resolve));
  }).then(() => {
    // Themes: the Look (named with its years) and, where the look has them, the wallpapers.
    run("renderThemes=()=>{};themeRows=[{key:'view'},{key:'wallpaper'},{key:'return'}];themeState={...themeState,backgrounds:[{id:'a',label:'A'},{id:'b',label:'B'}],selected:'a',boot_animation:'theme'};mode='themes';selected=1;activateTheme()");
    assert.equal(byId['guide-title'].textContent, 'Wallpaper'); assert.deepEqual(labels(), ['✓ A', 'B']);
    // The wallpaper changes as the cursor moves; B puts the current one back without saving anything.
    run("globalThis.previews=[];skin.applyTheme=state=>previews.push(state.selected)");
    run("input('down')"); assert.deepEqual(Array.from(run('previews')), ['b']);
    run("input('b')"); assert.deepEqual(Array.from(run('previews')), ['b', 'a'], 'B restores the wallpaper in use');
    assert.ok(!calls.some(call => call[0] === 'theme'), 'nothing was saved');
    run("mode='themes';selected=1;activateTheme();input('down');input('a')");
    assert.deepEqual(Array.from(run('previews')), ['b', 'a', 'b'], 'A keeps the one being previewed (the main process saves it)');
    assert.deepEqual(calls.at(-1), ['theme', 'b']);
    return new Promise(resolve => setImmediate(resolve)); // let the saving finish: keys are ignored while the app is busy
  }).then(() => {
    run("mode='themes';selected=1;activateTheme()");
    run("input('b')");
    run("mode='themes';selected=0;activateTheme()");
    assert.equal(run('mode'), 'views', 'the View row opens the timeline');
    assert.equal(run('viewPicker.focus'), 1, 'it starts on the view in use (NXE)');
    run("input('left');input('a')");
    return new Promise(resolve => setImmediate(resolve));
  }).then(() => new Promise(resolve => setImmediate(resolve))).then(() => {
    assert.deepEqual(calls.at(-1), ['skin', 'blades']);
    assert.notEqual(byId['guide-title'].textContent, 'Boot animation', 'following the theme: nothing to ask');
    // A boot animation fixed to another look: changing the look asks whether to follow it.
    run("themeState={...themeState,boot_animation:'kinect'};mode='themes';selected=0;activateTheme();input('a')");
    return new Promise(resolve => setImmediate(resolve));
  }).then(() => new Promise(resolve => setImmediate(resolve))).then(() => {
    assert.equal(byId['guide-title'].textContent, 'Boot animation');
    assert.deepEqual(labels(), ['✓ Yes, use Blades / NXE (2005-2011)', 'No, keep Kinect / Metro (2011-2012)', 'Always use the boot animation of the theme']);
    run("input('down');input('down');input('a')");
    return new Promise(resolve => setImmediate(resolve));
  }).then(() => {
    assert.deepEqual(calls.at(-1), ['boot', 'theme']);
    // Which video plays: the look in use, a chosen look's, or none; a look that is gone falls back to the one in use.
    assert.equal(run("bootVideo({boot_animation:'theme'})"), 'skins/nxe/assets/boot.webm');
    assert.equal(run("bootVideo({})"), 'skins/nxe/assets/boot.webm');
    assert.equal(run("bootVideo({boot_animation:'kinect'})"), 'skins/kinect/assets/boot.webm');
    assert.equal(run("bootVideo({boot_animation:'off'})"), null);
    assert.equal(run("bootVideo({boot_animation:'blades'})"), 'skins/nxe/assets/boot.webm'); // an old setting that names a look: follow the theme
  });
});

test('the choice menu stacks above the settings screens (and below the launch screen)', () => {
  const css = fs.readFileSync(path.join(__dirname, '..','skins', 'nxe', 'nxe.css'), 'utf8');
  const z = id => Number(new RegExp(`${id}\\s*\\{[^}]*z-index:(\\d+)`).exec(css)?.[1]);
  assert.ok(z('#guide-dialog') > z('#overlay'), 'the menu must be drawn over the screen that opened it');
  assert.ok(z('#guide-dialog') < z('#launch-overlay'));
});

test('System settings does not repeat the Profiles and Advanced tiles, while a game\'s settings keep Advanced', () => {
  class Element { constructor(t) { this.tagName = t; this.className = ''; this.children = []; this.textContent = ''; this.dataset = {}; this.style = { removeProperty() {}, setProperty() {} }; this.classList = { toggle() {}, add() {}, remove() {} }; } append(...c) { this.children.push(...c); } replaceChildren(...c) { this.children = c; } setAttribute() {} addEventListener() {} cloneNode() { return new Element(this.tagName); } querySelectorAll() { return []; } scrollIntoView() {} }
  const byId = {}, document = { body: new Element('body'), querySelector: () => new Element('div'), createTextNode: text => ({ textContent: text }), getElementById: id => byId[id] ||= new Element('div'), createElement: t => new Element(t) };
  const context = vm.createContext({ window: { electronAPI: {}, addEventListener() {}, matchMedia: () => ({ matches: false }), uiSounds: { play() {} } }, document, requestAnimationFrame() {}, navigator: {}, setTimeout, clearTimeout });
  loadDashboard(vm, context, "gamesList=[];renderCarousel();");
  const run = code => vm.runInContext(code, context);
  const categories = [{ id: 'console', label: 'Console' }, { id: 'display', label: 'Display' }, { id: 'profiles', label: 'Profiles', separate: true }, { id: 'storage', label: 'Storage' }].map(c => ({ ...c, description: '', items: [] }));
  const labels = () => { const grid = byId['modal-content'].children.find(node => node.children?.length); return grid.children.map(button => button.textContent); };
  run(`xeniaView={categories:${JSON.stringify(categories)},advanced:[],flavor:'xenia-edge',file:'x',game:null};xeniaScope=null;xeniaPath=null;entryMode=null;renderXeniaHome()`);
  assert.deepEqual(labels(), ['Console', 'Display', 'Storage', 'Return to dashboard'], 'no Profiles, no Advanced: they are tiles of the Xenia section');
  run("renderXeniaItems=()=>{};selected=2;activate()"); assert.equal(run('xeniaPath.id'), 'storage', 'the list index maps to the visible categories, not the hidden one');
  run(`xeniaView.game={title:'Gears',title_id:'4D5307D5'};xeniaScope='g1';xeniaPath=null;renderXeniaHome()`);
  assert.deepEqual(labels(), ['Optimized settings', 'Console', 'Display', 'Profiles', 'Storage', 'Advanced (every Xenia setting)', 'Return to game options'], 'a game starts with Optimized settings and keeps Advanced');
  run("selected=5;activate()"); assert.equal(run('mode'), 'xenia-advanced');
  run("renderXeniaItems=()=>{};openOptimized=()=>{globalThis.called='optimized'};xeniaPath=null;renderXeniaHome();selected=0;activate()"); assert.equal(run('called'), 'optimized', 'the first row opens the optimized settings');
  run("selected=1;activate()"); assert.equal(run('xeniaPath.id'), 'console', 'categories are shifted by the extra row');
});

test('the Updates screen offers the right rows for each situation and never switches Xenia behind your back', async () => {
  class Element { constructor(t) { this.tagName = t; this.className = ''; this.children = []; this.textContent = ''; this.dataset = {}; this.style = { removeProperty() {}, setProperty() {} }; this.classList = { toggle() {}, add() {}, remove() {} }; } append(...c) { this.children.push(...c); } replaceChildren(...c) { this.children = c; } setAttribute() {} addEventListener() {} cloneNode() { return new Element(this.tagName); } querySelectorAll() { return []; } scrollIntoView() {} }
  const byId = {}, document = { body: new Element('body'), querySelector: () => new Element('div'), createTextNode: text => ({ textContent: text }), getElementById: id => byId[id] ||= new Element('div'), createElement: tag => new Element(tag) };
  const calls = [];
  const edge = (over = {}) => ({ id: 'edge', label: 'Xenia Edge', supported: true, installed: null, previous: null, executable: '/data/xenia/edge/xenia_edge_linux.AppImage', in_use: false, ...over });
  const status = (channel, configured = '/opt/my-xenia.AppImage') => ({ platform: 'linux', configured, channels: [channel] });
  let next = status(edge());
  const api = { checkUpdate: async id => { calls.push(['check', id]); return { tag: 'new1111', published_at: '2026-10-13', notes: '', asset: { size: 19000000 } }; }, installUpdate: async id => { calls.push(['install', id]); return next; }, useUpdate: async id => { calls.push(['use', id]); return next; }, rollbackUpdate: async id => { calls.push(['rollback', id]); return next; }, lockAdmin: async () => {} };
  const context = vm.createContext({ window: { electronAPI: api, addEventListener() {}, matchMedia: () => ({ matches: false }), uiSounds: { play() {} } }, document, requestAnimationFrame() {}, navigator: {}, setTimeout: fn => fn(), clearTimeout });
  loadDashboard(vm, context, "gamesList=[];renderCarousel();renderUpdates=()=>{};");
  const run = code => vm.runInContext(code, context), rows = () => Array.from(run('updatesRows().map(row=>row.label)'));
  const set = (view, latest = {}) => run(`updatesView=${JSON.stringify(view)};updatesLatest=${JSON.stringify(latest)};updatesChannel='edge'`);

  set(status(edge()));
  assert.deepEqual(rows(), ['Install Xenia Edge', 'Use my own Xenia…', 'Return to dashboard'], 'a first install just installs: nothing to check yet');
  set(status(edge()), { edge: { tag: 'new1111' } });
  assert.deepEqual(rows(), ['Install new1111', 'Use my own Xenia…', 'Return to dashboard']);
  set(status(edge()), { edge: { tag: 'new1111', current_tag: 'new1111' } });
  assert.deepEqual(rows(), ['Up to date ✓', 'Use my own Xenia…', 'Return to dashboard'], 'your own Xenia is already the latest build: nothing to install');
  set(status(edge()), { edge: { tag: 'new1111', current_tag: 'old0000' } });
  assert.deepEqual(rows(), ['Install new1111', 'Use my own Xenia…', 'Return to dashboard'], 'your own Xenia is an older build: offer a managed copy');
  set(status(edge({ installed: { tag: 'old0000' } })));
  assert.deepEqual(rows(), ['Check for updates', 'Use it in Xenia Dashboard', 'Use my own Xenia…', 'Return to dashboard'], 'installed and not checked yet: only Check for updates, no Update row');
  set(status(edge({ installed: { tag: 'old0000', published_at: '2026-10-01' }, previous: { tag: 'older99' } })), { edge: { tag: 'new1111' } });
  assert.deepEqual(rows(), ['Update to new1111', 'Use it in Xenia Dashboard', 'Go back to older99', 'Use my own Xenia…', 'Return to dashboard'], 'no Check button: the screen checks by itself and one row says where things stand');
  set(status(edge({ installed: { tag: 'new1111' }, in_use: true })), { edge: { tag: 'new1111' } });
  assert.deepEqual(rows(), ['Up to date ✓', 'Use my own Xenia…', 'Return to dashboard'], 'nothing to install when current; no "use" when already in use');
  set(status(edge({ installed: { tag: 'old0000' } })), { edge: 'checking' });
  assert.equal(rows()[0], 'Checking for updates…');
  set(status(edge({ installed: { tag: 'old0000' } })), { edge: { error: 'offline' } });
  assert.equal(rows()[0], 'Could not check · try again', 'a failed check can be tried again with A');
  set({ ...status(edge({ supported: false })) });
  assert.deepEqual(rows(), ['Return to dashboard'], 'an unsupported system shows only the way back');

  // Installing over an existing Xenia asks first, and keeping the current one is the default.
  set(status(edge({ installed: { tag: 'old0000' } })), { edge: { tag: 'new1111' } });
  next = status(edge({ installed: { tag: 'new1111' }, in_use: false }));
  run("mode='updates';selected=0");
  await run('activateUpdate()');
  assert.deepEqual(calls.at(-1), ['install', 'edge']);
  assert.equal(run('mode'), 'dialog'); assert.equal(byId['guide-title'].textContent, 'Use the new version?');
  assert.deepEqual(byId['guide-buttons'].children.map(button => button.textContent), ['✓ Keep my current Xenia', 'Use Xenia Edge new1111']);
  run("input('a')"); assert.equal(calls.some(([name]) => name === 'use'), false, 'a stray A keeps the Xenia the user already has');
  set(status(edge({ installed: { tag: 'old0000' } })), { edge: { tag: 'new1111' } });
  next = status(edge({ installed: { tag: 'new1111' }, in_use: false }));
  run("mode='updates';selected=0");
  await run('activateUpdate()'); run("input('down');input('a')");
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(calls.at(-1), ['use', 'edge'], 'only an explicit choice switches');
  set(status(edge({ installed: { tag: 'old0000' } })), { edge: { tag: 'new1111' } });
  next = status(edge({ installed: { tag: 'new1111' }, in_use: true }));
  run("mode='updates';selected=0"); await run('activateUpdate()');
  assert.deepEqual(rows(), ['Up to date ✓', 'Use my own Xenia…', 'Return to dashboard'], 'after installing the latest, the screen says so right away');
  // A first install (nothing configured) is used by the main process, so no question is asked.
  set(status(edge(), ''));
  next = { ...status(edge({ installed: { tag: 'new1111' }, in_use: true }), '/data/xenia/edge/xenia_edge_linux.AppImage'), config_ready: true };
  run("mode='updates';selected=0"); await run('activateUpdate()');
  assert.equal(run('mode'), 'updates'); assert.equal(run('xeniaReady'), true);
  // ...but a Xenia that has never run has no settings file yet: right after the first install a pop-up says to start it once.
  set(status(edge(), ''));
  next = { ...next, config_ready: false };
  run("mode='updates';selected=0"); await run('activateUpdate()');
  assert.equal(run('mode'), 'dialog'); assert.equal(byId['guide-title'].textContent, 'Start Xenia once');
});

test('the game menu offers game settings, hide/show, content, patches and details by name', async () => {
  const { run, byId } = guideHarness();
  const calls = [];
  run(`gameTarget={game:{id:'g',title:'Gears',title_id:'4D5307D5'},fromLibrary:true};
    openXenia=id=>globalThis.called='settings:'+id;openOptimized=()=>globalThis.called='optimized';openContent=()=>globalThis.called='content';openCoverManager=()=>globalThis.called='cover';openPatches=()=>globalThis.called='patches';openGameInfo=()=>globalThis.called='info';mode='game-menu'`);
  assert.deepEqual(Array.from(run('gameMenuEntries().map(entry=>entry.label)')), ['Game settings', 'DLC and updates', 'Change cover', 'Patches', 'Game details', 'Hide game', 'Return to games']);
  for (const [index, expected] of [[0, 'settings:g'], [1, 'content'], [2, 'cover'], [3, 'patches'], [4, 'info']]) { run(`selected=${index};activateGameMenu()`); assert.equal(run('called'), expected); }
  run("gameTarget.game.title_id='';called='';selected=1;activateGameMenu()"); assert.equal(run('called'), '', 'no title ID: game settings do not open');
  assert.match(byId['modal-error'].textContent, /no title ID/);
  run("called='';selected=2;activateGameMenu()"); assert.equal(run('called'), 'cover', 'a cover needs no title ID');
  run("gameTarget.game.title_id='';selected=5;activateGameMenu()"); assert.equal(run('mode'), 'game-menu', 'hide/show remains available without a title ID');
  run("gameTarget.game.hidden=true");assert.equal(run('gameMenuEntries()[5].label'),'Show game');
  run("gameTarget.game.title_id='4D5307D5';openXenia=async()=>{globalThis.called='reopened'};highlight=()=>{};mode='optimized';selected=0");
  assert.equal(run("xeniaBack()"), true, 'B on the optimized screen goes back to the game settings');
  assert.equal(run('called'), 'reopened');
});
test('the DLC screen offers every package, marked installed when Xenia already has it', () => {
  const { run } = guideHarness();
  const rows = view => { run(`contentView=${JSON.stringify(view)}`); return Array.from(run('contentRows().map(row=>row.label)')); };
  assert.deepEqual(rows({ available: [], installed: [] }), ['Return to game options']);
  assert.deepEqual(rows({ available: [{ name: 'a', label: 'DLC', display_name: 'Map Pack', installed: false }, { name: 'b', label: 'DLC', display_name: '', installed: true }, { name: 'tu3', label: 'DLC', display_name: '', installed: false }], installed: [] }), ['Install: DLC · Map Pack', '✓ Installed: DLC · b', 'Install: DLC · tu3', 'Return to game options']);
});
test('the optimized settings screen offers Apply only when there is something to change', () => {
  const { run } = guideHarness();
  const rows = view => { run(`optimizedView=${JSON.stringify(view)}`); return Array.from(run('optimizedRows().map(row=>row.label)')); };
  assert.deepEqual(rows({ available: false }), ['Return to game options']);
  assert.deepEqual(rows({ available: true, changes: [], skipped: [], unchanged: 2 }), ['Return to game options']);
  assert.deepEqual(rows({ available: true, changes: [{ name: 'GPU › a', from: 1, to: 2 }], skipped: [], unchanged: 0 }), ['Apply 1 setting', 'Return to game options']);
  assert.deepEqual(rows({ available: true, changes: [{}, {}], skipped: [], unchanged: 0 }), ['Apply 2 settings', 'Return to game options']);
  assert.equal(run("optimizedValue('strict')"), '"strict"'); assert.equal(run('optimizedValue(120)'), '120'); assert.equal(run('optimizedValue(false)'), 'false');
});

test('the cover manager shows the same flow for every source and one bulk screen', () => {
  const { run } = guideHarness();
  const sources = [{ id: 'xenia-manager', label: 'Xenia Manager', needs_download: false, ready: true }, { id: 'launchbox', label: 'LaunchBox', needs_download: true, ready: false, built: 0, games: 0 }];
  const labels = () => Array.from(run('coverRows().map(row=>row.label)'));
  run(`cm={...cm,context:{game:{id:'g',title:'Gears'},leave(){}},sources:${JSON.stringify(sources)},stage:'home',source:null,games:[],pictures:[],game:null,query:'Gears'}`);
  assert.deepEqual(labels(), ['Choose an image from this computer', 'Xenia Manager covers (online)', 'LaunchBox covers (online)', 'Return to game options'], 'a file and every source, in one list');
  run(`cm.stage='setup';cm.source=cm.sources[1]`); assert.deepEqual(labels(), ['Download LaunchBox data', 'Return']);
  run(`cm.stage='games';cm.source=cm.sources[1];cm.games=[{key:'1',title:'Gears of War',pictures:5}]`); assert.deepEqual(labels(), ['Search LaunchBox for: Gears', 'Gears of War (5)', 'Update LaunchBox data', 'Return'], 'LaunchBox exposes editable search text and can refresh its data');
  run(`cm.source=cm.sources[0]`); assert.deepEqual(labels(), ['Gears of War (5)', 'Return'], 'Xenia Manager has no LaunchBox query row or data update');
  run(`cm.stage='pictures';cm.pictures=[{key:'a',label:'Front · North America'},{key:'b',label:'3D box'}]`); assert.deepEqual(labels(), ['Front · North America', '3D box', 'Back']);
  run(`cm.context={game:null,leave(){}};cm.stage='bulk';cm.mode='xenia-manager'`);
  assert.deepEqual(labels(), ['Source: Xenia Manager', 'Download covers', 'Download missing covers', 'Rescan local cover images', 'Return'], 'Source first, the downloads next, the local scan last; no per-game search or replace: that is Change cover');
  run(`cm.mode='launchbox'`); assert.deepEqual(labels(), ['Source: LaunchBox', 'Update LaunchBox data', 'Download covers', 'Download missing covers', 'Rescan local cover images', 'Return'], 'the data of the source sits right under it');
  run(`cm.mode='both'`); assert.deepEqual(labels(), ['Source: LaunchBox, then Xenia Manager', 'Update LaunchBox data', 'Download covers', 'Download missing covers', 'Rescan local cover images', 'Return']);
  run(`cm.sources[1].ready=true`); assert.deepEqual(labels(), ['Source: LaunchBox, then Xenia Manager', 'Update LaunchBox data', 'Download covers', 'Download missing covers', 'Rescan local cover images', 'Return'], 'already downloaded: the row stays, to refresh it');
});
test('the per-game LaunchBox search row opens the text editor and searches with its edited query', async () => {
  const { run } = guideHarness();
  run(`globalThis.edits=[];globalThis.searched=null;globalThis.rendered=null;
    editTextEntry=action=>edits.push(action);
    renderCover=index=>globalThis.rendered=index;
    api.searchCovers=async(gameId,source,query)=>{globalThis.searched=[gameId,source,query];return [{key:'77',title:'Halo 3',pictures:2}]};
    cm={...cm,context:{game:{id:'g',title:'Halo'}},source:{id:'launchbox'},stage:'games',query:'Halo',games:[]};selected=0;`);
  await run('activateCover()');
  assert.deepEqual(Array.from(run('[edits[0].title,edits[0].label,edits[0].value]')), ['Search LaunchBox', 'Game name', 'Halo']);
  await run("edits[0].onDone(' Halo 3 ')");
  assert.deepEqual(Array.from(run('searched')), ['g', 'launchbox', 'Halo 3']);
  assert.equal(run('cm.query'), 'Halo 3'); assert.equal(run('cm.games[0].title'), 'Halo 3'); assert.equal(run('rendered'), 0);
});
test('B steps back through the cover manager one level at a time and leaves to where it was opened from', () => {
  const { run } = guideHarness();
  run(`globalThis.left=0;renderCover=()=>{};cm={...cm,context:{game:{id:'g',title:'Gears'},leave(){globalThis.left++}},stage:'pictures'}`);
  for (const [from, to] of [['pictures', 'games'], ['games', 'home'], ['setup', 'home']]) { run(`cm.stage='${from}'`); assert.equal(run('coverBack()'), true); assert.equal(run('cm.stage'), to, `${from} → ${to}`); }
  assert.equal(run('left'), 0); run("cm.stage='home';coverBack()"); assert.equal(run('left'), 1, 'home → leaves'); run("cm.stage='bulk';coverBack()"); assert.equal(run('left'), 2, 'the bulk screen leaves too');
});
test('a skin with its sections side by side swaps the arrow keys: ←/→ change section, ↑/↓ move through the items', () => {
  const registry = createSectionRegistry().register(section('library', { order: 1 })).register(section('xenia', { order: 2 })).register(section('dash', { order: 3 }));
  const nav = createNavigator({ sections: registry, count: () => 8, axis: 'horizontal' });
  assert.equal(nav.axis, 'horizontal');
  assert.deepEqual(nav.dispatch('down'), { type: 'move', section: 'library', from: 0, to: 1, delta: 1 });
  assert.equal(nav.dispatch('up').to, 0);
  assert.equal(nav.dispatch('up'), null, 'clamped at the first item');
  assert.equal(nav.dispatch('rb').to, 5, 'LB/RB still jump five items');
  assert.deepEqual(nav.dispatch('right'), { type: 'section', from: 'library', to: 'xenia', direction: 'right' });
  assert.equal(nav.dispatch('left').to, 'library');
  assert.equal(nav.dispatch('left').to, 'dash', 'the sections still form a ring');
  assert.equal(nav.index('library'), 5, 'each section keeps its own place');
  nav.setAxis('vertical'); assert.equal(nav.dispatch('down').to, 'library', 'switching skins switches the keys back');
  assert.throws(() => nav.setAxis('diagonal'), /Unknown navigation axis/);
  assert.throws(() => createNavigator({ sections: registry, count: () => 1, axis: 'diagonal' }), /Unknown navigation axis/);
});
test('the skin contract accepts the optional axis, stylesheet and unmount, and rejects nonsense for them', () => {
  const base = () => Object.fromEntries([['name', 'blades'], ...Object.keys(REQUIRED).map(method => [method, () => {}])]);
  const registry = createSkinRegistry();
  registry.register({ ...base(), axis: 'horizontal', stylesheet: 'skins/blades/blades.css', unmount() {} });
  assert.deepEqual(registry.names(), ['blades']); assert.equal(registry.get('blades').axis, 'horizontal'); assert.equal(registry.get('nope'), null);
  for (const bad of [{ axis: 'diagonal' }, { stylesheet: '../x.css' }, { stylesheet: 'http://x/a.css' }, { unmount: 3 }]) assert.throws(() => createSkinRegistry().register({ ...base(), ...bad }), /axis|stylesheet|unmount/);
});
test('sections may be a "list" (items that run vertically on a skin whose blades are drawn side by side)', () => {
  assert.doesNotThrow(() => createSectionRegistry().register(section('games', { kind: 'list' })));
});

test('the Blades skin keeps the whole contract, runs sideways and ships its own stylesheet', () => {
  const { createBladesSkin } = require('../skins/blades/blades-skin');
  const registry = createSkinRegistry(), skin = createBladesSkin();
  registry.register(skin);
  assert.equal(skin.axis, 'horizontal'); assert.equal(skin.wrap, false);
  assert.throws(() => registry.register({ ...skin, name: 'x', wrap: 'no' }), /wrap/);
  const sections = createSectionRegistry();
  for (const [id, order] of [['a', 1], ['b', 2], ['c', 3]]) sections.register({ id, label: id, kind: 'list', order, items: () => [], caption: () => ({}) });
  const nav = createNavigator({ sections, count: () => 0, axis: 'horizontal', wrap: false });
  assert.equal(nav.dispatch('left'), null, 'the first blade stops');
  nav.dispatch('right'); nav.dispatch('right'); assert.equal(nav.section, 'c');
  assert.equal(nav.dispatch('right'), null, 'the last blade stops');
  nav.setWrap(true); assert.equal(nav.dispatch('right').to, 'a', 'NXE keeps the ring');
  assert.ok(fs.existsSync(path.join(__dirname, '..',skin.stylesheet)));
  assert.ok(APP_FILES.has(skin.stylesheet) && packaged(skin.stylesheet));
});

test('each skin\'s boot video exists and is packaged; a nonsense boot path is refused', () => {
  const { createBladesSkin } = require('../skins/blades/blades-skin');
  const { createNxeSkin } = require('../skins/nxe/nxe-skin');
  const { createKinectSkin } = require('../skins/kinect/kinect-skin');
  const { createMetroSkin } = require('../skins/metro-v1/metro-v1-skin');
  for (const skin of [createBladesSkin(), createNxeSkin(), createKinectSkin(), createMetroSkin()]) {
    assert.ok(BOOTS.some(boot => boot.id === skin.boot), skin.boot);
    assert.ok(packaged('skins/x/assets/y.png'));
  }
  for (const boot of BOOTS) { assert.ok(fs.existsSync(path.join(__dirname, '..',boot.video)), boot.video); assert.ok(appFile(boot.video), boot.video); }
  const registry = createSkinRegistry(), skin = createBladesSkin();
  assert.throws(() => registry.register({ ...skin, name: 'x', boot: '../main.js' }), /boot video/);
});

test('the app protocol can stream media: it is registered with stream and answers byte ranges (a boot video fails to play otherwise)', () => {
  const main = fs.readFileSync(path.join(__dirname, '..','src','main.js'), 'utf8');
  assert.match(main, /scheme:'nxe-app',privileges:\{[^}]*stream:true/);
  const handler = main.slice(main.indexOf("protocol.handle('nxe-app'"), main.indexOf("protocol.handle('kratos-art'"));
  assert.match(handler, /musicResponse\(asset\.bytes,request\.headers\.get\('range'\)/);
});

test('looks are listed oldest first, whatever order they were registered in', () => {
  const base = name => ({ name, mount() {}, showSections() {}, applyTheme() {}, setMotion() {}, renderRail() {}, focusRail() {}, setLaunch() {} });
  const registry = createSkinRegistry();
  registry.register({ ...base('metro-v2'), since: 2012 }).register({ ...base('nxe'), since: 2008 }).register(base('undated')).register({ ...base('blades'), since: 2005 }).register({ ...base('metro-v1'), since: 2011 });
  assert.deepEqual(registry.names(), ['blades', 'nxe', 'metro-v1', 'metro-v2', 'undated']);
  for (const bad of [1999, 2008.5, '2008', 3000]) assert.throws(() => createSkinRegistry().register({ ...base('x'), since: bad }), /release year/, String(bad));
  const { createBladesSkin } = require('../skins/blades/blades-skin'), { createNxeSkin } = require('../skins/nxe/nxe-skin');
  assert.ok(createBladesSkin().since < createNxeSkin().since);
  assert.ok(createNxeSkin().since < require('../skins/kinect/kinect-skin').createKinectSkin().since);
});

test('the Kinect skin keeps the whole contract, starts with the Kinect boot video and ships every picture it names', () => {
  const { createKinectSkin } = require('../skins/kinect/kinect-skin');
  const registry = createSkinRegistry(), skin = createKinectSkin();
  registry.register(skin);
  assert.equal(skin.axis, 'vertical'); assert.notEqual(skin.wrap, false); assert.equal(skin.boot, 'kinect');
  assert.ok(fs.existsSync(path.join(__dirname, '..',skin.stylesheet)));
  for (const file of ['skins/kinect/kinect-skin.js', skin.stylesheet]) assert.ok(APP_FILES.has(file) && packaged(file), file);
  const source = fs.readFileSync(path.join(__dirname, '..','skins/kinect/kinect-skin.js'), 'utf8');
  const named = new Set([...source.matchAll(/'(icon-[a-z]+)'/g)].map(match => `${match[1]}.png`));
  for (const name of ['background.jpg', 'floor.png', 'orb.png', 'button-a.png', 'button-x.png', 'button-y.png', ...named]) {
    const file = `skins/kinect/assets/${name}`;
    assert.ok(fs.existsSync(path.join(__dirname, '..',file)), file); assert.ok(appFile(file), file);
  }
});

test('grid navigation (Metro): columns of rows, ↑/↓ inside a column, ←/→ across and off the edge to the next section', () => {
  const sections = createSectionRegistry();
  for (const [id, order] of [['games', 1], ['xenia', 2], ['dash', 3]]) sections.register({ id, label: id, kind: 'list', order, items: () => [], caption: () => ({}) });
  const sizes = { games: 5, xenia: 6, dash: 5 };
  const nav = createNavigator({ sections, count: id => sizes[id], axis: 'grid', wrap: false, rows: () => 2 });
  // games: column 0 = 0,1; column 1 = 2,3; column 2 = 4
  assert.equal(nav.dispatch('up'), null, 'top of the column');
  assert.equal(nav.dispatch('down').to, 1); assert.equal(nav.dispatch('down'), null, 'bottom of the column');
  assert.equal(nav.dispatch('right').to, 3, 'same row, next column');
  assert.equal(nav.dispatch('right').to, 4, 'the last column is short: lands on its last tile');
  assert.equal(nav.dispatch('left', { stay: true }).to, 2);
  nav.setIndex('games', 4);
  assert.equal(nav.dispatch('right', { stay: true }), null, 'choosing a disc: the section does not change');
  const off = nav.dispatch('right');
  assert.deepEqual([off.type, off.to, off.direction], ['section', 'xenia', 'right'], 'past the last column: next section');
  assert.equal(nav.dispatch('left').to, 'games', 'past the first column: previous section');
  assert.equal(nav.dispatch('lb'), null, 'no section before the first (wrap off)');
  assert.deepEqual([nav.dispatch('rb').to, nav.dispatch('rb').to], ['xenia', 'dash'], 'bumpers change section');
  assert.equal(nav.dispatch('rb'), null);
  nav.setRows(() => 1); nav.focusSection('games'); nav.setIndex('games', 0);
  assert.equal(nav.dispatch('right').to, 1, 'one row: ←/→ walk the items');
});

test('the Metro skin keeps the whole contract, runs on the grid of two rows and ships every picture it names', () => {
  const { createMetroSkin } = require('../skins/metro-v1/metro-v1-skin');
  const registry = createSkinRegistry(), skin = createMetroSkin();
  registry.register(skin);
  assert.equal(skin.axis, 'grid'); assert.equal(skin.wrap, false); assert.equal(skin.rows('rail'), 2); assert.equal(skin.boot, 'kinect');
  assert.ok(require('../skins/kinect/kinect-skin').createKinectSkin().since < skin.since);
  assert.throws(() => createSkinRegistry().register({ ...skin, rows: 2 }), /rows must be a function/);
  for (const file of ['skins/metro-v1/metro-v1-skin.js', skin.stylesheet]) assert.ok(APP_FILES.has(file) && packaged(file), file);
  const css = fs.readFileSync(path.join(__dirname, '..',skin.stylesheet), 'utf8'), imported = css.match(/@import url\('\.\.\/([^']+)'\)/)[1];
  assert.ok(APP_FILES.has(`skins/${imported}`), 'the Kinect screens it imports are served');
  const source = fs.readFileSync(path.join(__dirname, '..','skins/metro-v1/metro-v1-skin.js'), 'utf8');
  const named = new Set([...source.matchAll(/'(icon-[a-z]+)'/g)].map(match => `${match[1]}.png`));
  for (const name of ['background.jpg', 'boxart.jpg', 'button-a.png', 'button-x.png', 'button-y.png', ...named]) {
    const file = `skins/metro-v1/assets/${name}`;
    assert.ok(fs.existsSync(path.join(__dirname, '..',file)), file); assert.ok(appFile(file), file);
  }
});

test('the NXE skin keeps the whole contract and ships its channel-change sound', () => {
  const { createNxeSkin } = require('../skins/nxe/nxe-skin');
  const registry = createSkinRegistry(), skin = createNxeSkin();
  registry.register(skin);
  assert.equal(skin.axis, 'vertical'); assert.notEqual(skin.wrap, false); assert.equal(skin.boot, 'classic'); assert.equal(skin.since, 2008);
  for (const file of ['skins/nxe/nxe-skin.js', skin.stylesheet]) assert.ok(APP_FILES.has(file) && packaged(file), file);
  assert.ok(fs.existsSync(path.join(__dirname, '..','skins/nxe/assets/channel.wav')) && appFile('skins/nxe/assets/channel.wav'));
});

test('LT / RT change to the previous / next section on every look, whatever its axis, and honour wrap and the disc picker', () => {
  const sections = createSectionRegistry();
  for (const [id, order] of [['a', 1], ['b', 2], ['c', 3]]) sections.register({ id, label: id, kind: 'list', order, items: () => [], caption: () => ({}) });
  const sizes = { a: 5, b: 5, c: 5 };
  const make = (axis, wrap) => createNavigator({ sections, count: id => sizes[id], axis, wrap, rows: () => 2 });
  for (const [axis, last, first] of [['vertical', 'down', 'up'], ['horizontal', 'right', 'left'], ['grid', 'right', 'left']]) {
    const nav = make(axis, false);
    const next = nav.dispatch('rt'); assert.deepEqual([next.type, next.to, next.direction], ['section', 'b', last], axis);
    assert.equal(nav.dispatch('lt').to, 'a'); assert.equal(nav.dispatch('lt'), null, `${axis}: no section before the first when it does not wrap`);
    nav.dispatch('rt'); nav.dispatch('rt'); assert.equal(nav.dispatch('rt'), null, `${axis}: the last one stops`);
    assert.equal(nav.dispatch('lt', { stay: true }), null, `${axis}: choosing a disc keeps the section`);
    assert.equal(nav.section, 'c');
    const jumped = make(axis, true); jumped.dispatch('lt'); assert.equal(jumped.section, 'c', `${axis}: a ring wraps`);
    assert.equal(jumped.dispatch('rt').direction, last);
    assert.equal(first.length > 0, true);
  }
  // LB / RB keep their jobs: five items on NXE and blades, a section on Metro.
  const nxe = make('vertical', true); assert.equal(nxe.dispatch('rb').delta, 5);
});

test('every view describes itself for the timeline, and its preview is served and packaged', () => {
  const { createBladesSkin } = require('../skins/blades/blades-skin'), { createNxeSkin } = require('../skins/nxe/nxe-skin');
  const { createKinectSkin } = require('../skins/kinect/kinect-skin'), { createMetroSkin } = require('../skins/metro-v1/metro-v1-skin');
  const { appFile } = require('../src/local-assets');
  const { createSkinRegistry } = require('../dashboard/skin');
  for (const skin of [createBladesSkin(), createNxeSkin(), createKinectSkin(), createMetroSkin()]) {
    for (const key of ['name', 'years', 'blurb']) assert.ok(typeof skin.about?.[key] === 'string' && skin.about[key].length > 2, `${skin.name}.about.${key}`);
    const preview = `assets/views/${skin.name}.jpg`;
    assert.ok(fs.existsSync(path.join(__dirname, '..', preview)), `${preview} exists`);
    assert.ok(appFile(preview) && packaged(preview), `${preview} is served and packaged`);
  }
  assert.equal(appFile('assets/views/../x.jpg'), false);
  assert.equal(appFile('assets/views/nxe.png'), false);
  const registry = createSkinRegistry(), base = { name: 'x', mount() {}, showSections() {}, applyTheme() {}, setMotion() {}, renderRail() {}, focusRail() {}, setLaunch() {} };
  registry.register(base);
  assert.throws(() => registry.register({ ...base, name: 'y', about: { name: 'Y' } }), /about/, 'an incomplete description is refused');
  assert.throws(() => registry.register({ ...base, name: 'z', about: 'text' }), /about/);
  registry.register({ ...base, name: 'w', about: { name: 'W', years: '2013', blurb: 'A new one' } });
});
