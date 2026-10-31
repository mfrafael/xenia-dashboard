'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { loadDashboard } = require('./helpers/dashboard');
const { createSectionRegistry } = require('../dashboard/sections');

const state = (over = {}) => ({
  modes: { dashboard: 'notify', xenia: 'notify' },
  dashboard: { kind: 'installer', current: '1.3.0', latest: null, downloaded: false },
  xenia: { channel: 'edge', label: 'Xenia Edge', installed: 'v1.0.0', latest: null, managed: true },
  ...over
});

function harness(initial = state(), overrides = {}) {
  class Element {
    constructor(t) { this.tagName = t; this.className = ''; this.children = []; this.textContent = ''; this.dataset = {}; this.style = { removeProperty() {}, setProperty() {} }; const classes = new Set(); this.classList = { toggle: (c, on) => { if (on === undefined ? !classes.has(c) : on) classes.add(c); else classes.delete(c); }, add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c) }; }
    append(...c) { this.children.push(...c); } prepend(...c) { this.children.unshift(...c); } replaceChildren(...c) { this.children = c; } setAttribute() {} addEventListener() {} animate() {} scrollIntoView() {}
    get firstElementChild() { return this.children[0] || null; }
    walk() { return this.children.flatMap(child => [child, ...(child.walk ? child.walk() : [])]); }
    querySelectorAll(selector) { return selector === 'button' ? this.walk().filter(el => el.tagName === 'button') : []; }
    querySelector() { return null; }
  }
  const byId = {}, document = { body: new Element('body'), getElementById: id => byId[id] ||= new Element('div'), createElement: t => new Element(t), createTextNode: text => ({ textContent: text }), querySelector: () => new Element('div') };
  const calls = [], subscriptions = { open: 0, released: 0 };
  let current = initial, progress = null;
  const api = {
    getAdminAccess: async () => ({ pin_required: false }), lockAdmin: async () => {},
    getAppUpdates: async () => { calls.push('get'); return current; },
    setUpdateMode: async (item, mode) => { calls.push(['mode', item, mode]); if (overrides.modeError) throw new Error(overrides.modeError); current = { ...current, modes: { ...current.modes, [item]: mode } }; return current; },
    checkAppUpdates: async () => { calls.push('check'); if (overrides.checkError) throw new Error(overrides.checkError); if (overrides.check) current = overrides.check; return current; },
    installAppUpdate: async () => { calls.push('install'); progress?.(41.6); progress?.(NaN); if (overrides.installGate) await overrides.installGate; if (overrides.installError) throw new Error(overrides.installError); },
    installXeniaUpdate: async () => { calls.push('install-xenia'); if (overrides.xeniaError) throw new Error(overrides.xeniaError); current = { ...current, xenia: { ...current.xenia, installed: current.xenia.latest, latest: null } }; return current; },
    openReleasePage: async () => { calls.push('page'); },
    onAppUpdateProgress: callback => { progress = callback; subscriptions.open++; return () => { subscriptions.open--; subscriptions.released++; }; }
  };
  const context = vm.createContext({ window: { electronAPI: api, addEventListener() {}, matchMedia: () => ({ matches: false }), uiSounds: { play() {}, configure() {} } }, document, requestAnimationFrame() {}, addEventListener() {}, innerWidth: 1920, innerHeight: 1080, navigator: {}, setTimeout, clearTimeout });
  loadDashboard(vm, context, 'gamesList=[];xeniaReady=false;renderCarousel();');
  const run = code => vm.runInContext(code, context);
  const settle = () => new Promise(resolve => setImmediate(resolve)).then(() => new Promise(resolve => setImmediate(resolve)));
  const labels = () => JSON.parse(run("JSON.stringify(selectableButtons().map(button => button.textContent))"));
  const cursor = () => run('selected');
  return { run, byId, calls, settle, labels, cursor, subscriptions, emitProgress: percent => progress?.(percent) };
}

test('the Updates screen lists the two modes, then the state rows, then Return', async () => {
  const { run, labels, settle, cursor } = harness(state({ dashboard: { kind: 'installer', current: '1.3.0', latest: '1.4.0', downloaded: false }, xenia: { channel: 'edge', label: 'Xenia Edge', installed: 'v1.0.0', latest: 'v1.1.0', managed: true } }));
  await run('openAppUpdates()');
  assert.equal(run('mode'), 'app-updates');
  assert.deepEqual(labels(), ['Dashboard: Notify only', 'Xenia: Notify only', 'Update to 1.4.0', 'Update to v1.1.0', 'Return to dashboard']);
  assert.equal(cursor(), 0);
  const upToDate = harness();
  await upToDate.run('openAppUpdates()');
  assert.deepEqual(upToDate.labels(), ['Dashboard: Notify only', 'Xenia: Notify only', 'Dashboard 1.3.0 · Up to date', 'Xenia Edge v1.0.0 · Up to date', 'Return to dashboard']);
  const auto = harness(state({ modes: { dashboard: 'auto', xenia: 'auto' } }));
  await auto.run('openAppUpdates()');
  assert.deepEqual(auto.labels().slice(0, 2), ['Dashboard: Automatic', 'Xenia: Automatic']);
  await settle();
});

test('the Xenia rows are hidden when Xenia is not managed or unknown', async () => {
  for (const xenia of [null, { channel: 'edge', label: 'Xenia Edge', installed: 'v1.0.0', latest: 'v1.1.0', managed: false }]) {
    const h = harness(state({ xenia }));
    await h.run('openAppUpdates()');
    assert.deepEqual(h.labels(), ['Dashboard: Notify only', 'Xenia: Notify only', 'Dashboard 1.3.0 · Up to date', 'Return to dashboard']);
  }
});

test('a source install has no dashboard state row', async () => {
  const h = harness(state({ dashboard: { kind: 'source', current: '1.3.0', latest: null, downloaded: false } }));
  await h.run('openAppUpdates()');
  assert.deepEqual(h.labels(), ['Dashboard: Notify only', 'Xenia: Notify only', 'Xenia Edge v1.0.0 · Up to date', 'Return to dashboard']);
});

test('a Portable install offers Open release page instead of Update to…', async () => {
  for (const kind of ['portable', 'appimage-locked']) {
    const h = harness(state({ dashboard: { kind, current: '1.3.0', latest: '1.4.0', downloaded: false } }));
    await h.run('openAppUpdates()');
    assert.equal(h.labels()[2], 'Open release page');
    h.run('selected=2;input("a")'); await h.settle();
    assert.deepEqual(h.calls.slice(-1), ['page']);
  }
});

test('a mode change goes through the API and keeps the cursor on the row', async () => {
  const h = harness();
  await h.run('openAppUpdates()');
  h.run('selected=1;input("a")');           // opens the choice list
  assert.equal(h.run('mode'), 'dialog');
  assert.deepEqual(JSON.parse(h.run('JSON.stringify(dialog.choices.map(choice => choice.label))')), ['✓ Notify only', 'Automatic']);
  h.run('dialog.focus=1;input("a")'); await h.settle();
  assert.deepEqual(h.calls.filter(call => call[0] === 'mode'), [['mode', 'xenia', 'auto']]);
  assert.equal(h.run('mode'), 'app-updates');
  assert.equal(h.cursor(), 1);
  assert.equal(h.labels()[1], 'Xenia: Automatic');
});

test('left and right step the mode of the row', async () => {
  const h = harness();
  await h.run('openAppUpdates()');
  h.run('selected=0;input("right")'); await h.settle();
  assert.deepEqual(h.calls.filter(call => call[0] === 'mode'), [['mode', 'dashboard', 'auto']]);
  assert.equal(h.labels()[0], 'Dashboard: Automatic');
  assert.equal(h.cursor(), 0);
  h.run('input("left")'); await h.settle();
  assert.equal(h.labels()[0], 'Dashboard: Notify only');
});

test('Up to date checks again', async () => {
  const h = harness(state(), { check: state({ dashboard: { kind: 'installer', current: '1.3.0', latest: '1.4.0', downloaded: false } }) });
  await h.run('openAppUpdates()');
  h.run('selected=2;input("a")'); await h.settle();
  assert.deepEqual(h.calls.filter(call => call === 'check'), ['check']);
  assert.equal(h.labels()[2], 'Update to 1.4.0');
  assert.equal(h.cursor(), 2);
});

test('Update to… for the dashboard shows the progress, finite numbers only, and the errors stay on the row', async () => {
  const h = harness(state({ dashboard: { kind: 'installer', current: '1.3.0', latest: '1.4.0', downloaded: false } }), { installError: 'Close the running game first.' });
  await h.run('openAppUpdates()');
  const seen = [];
  h.run('selected=2');
  const original = h.byId['modal-error'];
  Object.defineProperty(original, 'textContent', { get() { return this._t || ''; }, set(value) { this._t = value; seen.push(value); } });
  h.run('input("a")'); await h.settle();
  assert.ok(seen.includes('Downloading… 41%'), `progress shown, saw ${JSON.stringify(seen)}`);
  assert.ok(!seen.some(text => /NaN/.test(text)), 'a non-finite percent is ignored');
  assert.equal(original.textContent, 'Close the running game first.');
  assert.equal(h.cursor(), 2);
});

test('Update to… for Xenia installs and shows the new state', async () => {
  const h = harness(state({ xenia: { channel: 'edge', label: 'Xenia Edge', installed: 'v1.0.0', latest: 'v1.1.0', managed: true } }));
  await h.run('openAppUpdates()');
  h.run('selected=3;input("a")'); await h.settle();
  assert.ok(h.calls.includes('install-xenia'));
  assert.equal(h.labels()[3], 'Xenia Edge v1.1.0 · Up to date');
  assert.equal(h.cursor(), 3);
});

test('B and Return go back to Dashboard Settings', async () => {
  const h = harness();
  await h.run('openAppUpdates()');
  h.run('window.__back=0;returnSettings=()=>{window.__back++};input("b")');
  assert.equal(h.run('window.__back'), 1);
});

test('the tile is the first one of Dashboard Settings and opens the screen', () => {
  const registry = createSectionRegistry(), entered = [];
  require('../sections/settings').registerSettingsSections(registry, { enter: name => entered.push(name) });
  const dashboard = registry.get('dashboard'), ids = dashboard.items().map(item => item.id);
  assert.equal(ids[0], 'updates');
  dashboard.activate(dashboard.items().find(item => item.id === 'updates'));
  assert.deepEqual(entered, ['dashboard:updates']);
});

const errorText = h => h.byId['modal-error'].textContent;

test('a rejected mode change shows the message, keeps the cursor and leaves the screen usable', async () => {
  const h = harness(state(), { modeError: 'Not allowed.' });
  await h.run('openAppUpdates()');
  h.run('selected=1;input("a")'); h.run('dialog.focus=1;input("a")'); await h.settle();
  assert.equal(errorText(h), 'Not allowed.');
  assert.equal(h.run('mode'), 'app-updates', 'the choice list closed back onto the screen');
  assert.equal(h.cursor(), 1);
  assert.equal(h.labels()[1], 'Xenia: Notify only');
  h.run('input("down")'); h.run('selected=2;input("a")'); await h.settle();
  assert.ok(h.calls.includes('check'), 'still usable');
});

test('an Up to date re-check that fails shows the message on the row', async () => {
  const h = harness(state(), { checkError: 'Offline.' });
  await h.run('openAppUpdates()');
  h.run('selected=2;input("a")'); await h.settle();
  assert.equal(errorText(h), 'Offline.');
  assert.equal(h.cursor(), 2);
  assert.equal(h.run('mode'), 'app-updates');
});

test('a failing Xenia Update to… shows the message on the row', async () => {
  const h = harness(state({ xenia: { channel: 'edge', label: 'Xenia Edge', installed: 'v1.0.0', latest: 'v1.1.0', managed: true } }), { xeniaError: 'Close the running game first.' });
  await h.run('openAppUpdates()');
  h.run('selected=3;input("a")'); await h.settle();
  assert.equal(errorText(h), 'Close the running game first.');
  assert.equal(h.cursor(), 3);
  assert.equal(h.labels()[3], 'Update to v1.1.0');
});

test('the Checking… and Installing… texts are gone once the work succeeded', async () => {
  const h = harness(state({ xenia: { channel: 'edge', label: 'Xenia Edge', installed: 'v1.0.0', latest: 'v1.1.0', managed: true } }));
  await h.run('openAppUpdates()');
  h.run('selected=2;input("a")'); await h.settle();
  assert.equal(errorText(h), '');
  h.run('selected=3;input("a")'); await h.settle();
  assert.equal(errorText(h), '');
});

test('left and right do nothing on a row that is not a mode row', async () => {
  const h = harness();
  await h.run('openAppUpdates()');
  h.run('selected=2;input("right");input("left")'); await h.settle();
  assert.deepEqual(h.calls, ['get']);
  assert.equal(h.cursor(), 2);
});

// A download the test finishes by hand, and a record of every write to the error line.
function stalledDownload() {
  let finish;
  const gate = new Promise(resolve => { finish = resolve; });
  const h = harness(state({ dashboard: { kind: 'installer', current: '1.3.0', latest: '1.4.0', downloaded: false } }), { installGate: gate });
  const writes = [];
  Object.defineProperty(h.byId['modal-error'], 'textContent', { get() { return this._t || ''; }, set(value) { this._t = value; writes.push(value); } });
  return { h, writes, finish };
}

test('B leaves the Updates screen while the dashboard download runs, and the download keeps going', async () => {
  const { h, finish } = stalledDownload();
  await h.run('openAppUpdates()');
  h.run('selected=2;input("a")'); await h.settle();
  assert.deepEqual(h.calls.filter(call => call === 'install'), ['install']);
  h.run('input("b")');
  assert.equal(h.run('mode'), 'library', 'back out of the settings while the download is still running');
  finish(); await h.settle();
});

test('progress and the end of a download write nothing once the screen is closed, and the subscription is released', async () => {
  const { h, writes, finish } = stalledDownload();
  await h.run('openAppUpdates()');
  h.run('selected=2;input("a")'); await h.settle();
  h.run('input("b")');
  const before = writes.length;
  h.emitProgress(77);
  finish(); await h.settle();
  assert.deepEqual(writes.slice(before), [], 'nothing written to the error line after leaving');
  assert.equal(h.run('mode'), 'library', 'and the screen is not drawn again');
  assert.equal(h.subscriptions.open, 0);
  assert.equal(h.subscriptions.released, 1);
});

test('re-opening the screen mid-download cannot start a second download', async () => {
  const { h, finish } = stalledDownload();
  await h.run('openAppUpdates()');
  h.run('selected=2;input("a")'); await h.settle();
  h.run('input("b")');
  await h.run('openAppUpdates()');
  h.run('selected=2;input("a")'); await h.settle();
  assert.deepEqual(h.calls.filter(call => call === 'install'), ['install'], 'still one download');
  assert.match(h.byId['modal-error'].textContent, /already downloading/i);
  h.emitProgress(60);
  assert.equal(h.byId['modal-error'].textContent, 'Downloading… 60%', 'the re-opened screen shows the progress again');
  finish(); await h.settle();
  assert.equal(h.subscriptions.open, 0);
});
