'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const scanner = require('../src/scanner');
const { EventEmitter } = require('node:events');

async function mainHarness(withTheme=false,coverMode='none',gameExtra={},options={}) {
  const handlers = new Map(), calls = [], events = new Map(), windowEvents = new Map(), windowCalls = [], routes = new Map();
  const emulator = new EventEmitter();
  const game = { id: 'test-game', title: 'Test Game', rom_path: 'C:\\Games\\Test.iso', ...gameExtra };
  if(coverMode!=='none'){game.uses_fallback_art=false;game.cover_art_path=coverMode==='cached'?path.join(__dirname,'covers','test-game.jpg'):path.join(__dirname,'sidecar.jpg');}
  let now = 1000000, window;
  let dialogResult = { canceled: false, filePaths: ['C:\\Games\\Xbox360'] };
  const electron = {
    app: { setName(){},setPath(){},commandLine:{appendSwitch(){}},requestSingleInstanceLock: () => true, on() {}, whenReady: () => Promise.resolve(), getPath: name => options.userData && (name === 'userData' ? options.userData : name === 'home' ? path.join(options.userData, 'home') : null) || __dirname, quit() { windowCalls.push(['quit']); } },
    ipcMain: { handle: (name, fn) => handlers.set(name, fn) },
    globalShortcut: { isRegistered: () => false, register: () => { throw new Error('Unexpected registration on Windows'); }, unregisterAll() {} },
    protocol: { registerSchemesAsPrivileged() {}, handle() {} }, net: {fetch:async (url, init) => routes.has(url) ? routes.get(url)(url, init) : new Response(url.endsWith('games.json')?JSON.stringify([{id:'12345678',title:'Test Game'}]):Buffer.concat([Buffer.from([255,216,255,224]),Buffer.alloc(20)]))},
    nativeImage: { createFromBuffer: () => ({ isEmpty: () => false, getSize: () => ({ width: 10, height: 10 }), toJPEG: () => Buffer.concat([Buffer.from([255, 216, 255, 224]), Buffer.alloc(20, 9)]), toPNG: () => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(20, 9)]) }) },
    dialog: { showOpenDialog: async (_window, options) => { calls.push(options); return typeof dialogResult === 'function' ? dialogResult() : dialogResult; } },
    BrowserWindow: class {
      constructor() { window = this; this.webContents = { mainFrame: { url: 'nxe-app://dashboard/index.html' }, setWindowOpenHandler() {}, on: (name, fn) => events.set(name, fn), send: (channel, state) => windowCalls.push(channel === 'game:state' ? ['state', state.running] : [channel]), session: { setPermissionRequestHandler() {},setPermissionCheckHandler() {} } }; }
      setMenu() {} on(name, fn) { windowEvents.set(name, fn); } async loadFile() {} async loadURL() {}
      isDestroyed() { return false; }
      restore() { windowCalls.push(['restore']); } show() { windowCalls.push(['show']); } focus() { windowCalls.push(['focus']); }
      setKiosk(value) { windowCalls.push(['kiosk', value]); } setFullScreen(value) { windowCalls.push(['fullscreen', value]); }
      minimize() { windowCalls.push(['minimize']); }
      setAlwaysOnTop(value){windowCalls.push(['topmost',value]);}
    }
  };
  const context = vm.createContext({
    require: name => name === './xenia-releases' ? { ...require('../src/xenia-releases'), httpsFetcher: (url, init) => routes.has(url) ? Promise.resolve(routes.get(url)(url, init)) : Promise.reject(new Error(`unrouted ${url}`)) } : name === 'electron' ? electron : name === 'node:child_process' ? { spawn: () => emulator } : name === 'node:fs/promises' ? { access: async () => {},mkdir:async()=>{},writeFile:async()=>{},rename:async()=>{},unlink:async()=>{},readdir:(...args)=>require('node:fs/promises').readdir(...args) } : name==='./nxe'?{...require('../src/nxe'),loadTheme:async()=>({directory:__dirname,manifest:{version:1,assets:{},backgrounds:[{id:'theme-test',label:'Test'}],inventory:[],sounds:{},notes:[]},selected:'theme-test',audio:{volume:.5,muted:options.legacyMuted===true}})}:name === './scanner' ? { ...scanner, loadLibrary: async () => ({ rom_directory: options.romDirectory ?? '', rom_directories: options.romDirectory ? [options.romDirectory] : [], xenia_executable: options.executable ?? 'C:\\Xenia\\xenia.exe', games: [game], admin_credential: scanner.hashPin('1234'), ...(options.library || {}) }), scanDirectory: async () => [game], scanDirectories: async () => [game], saveLibrary: async () => {} } : require(name.startsWith('./') ? '../src/' + name.slice(2) : name),
    __dirname: path.join(__dirname, '..', 'src'), console: { info() {}, warn() {}, error() {} }, process: { platform: options.platform || 'win32', on() {} }, Date: { now: () => now }, URL, Response
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..','src','main.js'), 'utf8'), context);
  // main.js builds the window after several awaits (library, theme, scan); wait for it rather than for one tick.
  // The scan reads real folders, so wait in real time (up to 5 s), not in event-loop ticks.
  for (let attempts = 0; !window && attempts < 1000; attempts++) await new Promise(resolve => setTimeout(resolve, 5));
  assert.ok(window, 'main.js never created the window');
  const caller = () => ({ sender: window.webContents, senderFrame: window.webContents.mainFrame });
  return { calls, events, windowEvents, routes, emulator, windowCalls,hasHandler:name=>handlers.has(name), invoke: (name, ...args) => handlers.get(name)(caller(), ...args), untrusted: (name, ...args) => handlers.get(name)({ sender: {}, senderFrame: {} }, ...args), setTime: value => { now = value; }, setResult: value => { dialogResult = value; } };
}
test('PIN protection defaults on, can be disabled in-session and reenabled with the saved PIN',async()=>{
  const h=await mainHarness();
  assert.equal((await h.invoke('admin:access')).pin_required,true);
  await assert.rejects(h.invoke('admin:pin-protection',false),/session expired/);
  await assert.rejects(h.untrusted('admin:pin-protection',false),/Untrusted/);
  await h.invoke('admin:unlock','1234');
  await assert.rejects(h.invoke('admin:pin-protection','off'),/Invalid/);
  await h.invoke('admin:pin-protection',false);await h.invoke('admin:lock');
  await h.invoke('admin:unlock','');assert.equal((await h.invoke('admin:settings')).admin_pin_required,false);
  await h.invoke('admin:pin-protection',true);await h.invoke('admin:lock');
  await assert.rejects(h.invoke('admin:unlock',''),/Incorrect PIN/);
  await h.invoke('admin:unlock','1234');assert.equal((await h.invoke('admin:settings')).admin_pin_required,true);
});
test('hiding games requires Xenia access, persists across scans, and can be undone',async()=>{
  const h=await mainHarness();
  assert.deepEqual(Array.from((await h.invoke('library:get')).games,game=>game.id),['test-game']);
  assert.deepEqual(Array.from((await h.invoke('library:get')).hidden_games),[]);
  await assert.rejects(h.invoke('xenia:game-hidden','test-game',true),/session expired/);
  await assert.rejects(h.untrusted('xenia:game-hidden','test-game',true),/Untrusted/);
  await h.invoke('admin:unlock','1234','xenia');
  await assert.rejects(h.invoke('xenia:game-hidden','missing',true),/Unknown game/);
  await assert.rejects(h.invoke('xenia:game-hidden','test-game','yes'),/Invalid hidden-game setting/);
  const hidden=await h.invoke('xenia:game-hidden','test-game',true);
  assert.deepEqual(Array.from(hidden.games),[]);
  assert.equal(hidden.hidden_games[0].id,'test-game');
  assert.equal(hidden.hidden_games[0].hidden,true);
  const scanned=await h.invoke('xenia:roms-rescan');
  assert.deepEqual(Array.from(scanned),[],'rescans do not make hidden games visible');
  const shown=await h.invoke('xenia:game-hidden','test-game',false);
  assert.equal(shown.games[0].id,'test-game');
  assert.deepEqual(Array.from(shown.hidden_games),[]);
});
test('native pickers require PIN and trusted IPC, constrain picker type and preserve cancel', async () => {
  const h = await mainHarness();
  await assert.rejects(h.invoke('covers:search', 'test-game', 'xenia-manager'), /session expired/);
  assert.equal(h.hasHandler('admin:theme-import'),false);
  await assert.rejects(h.invoke('admin:theme-select',null), /session expired/);
  await assert.rejects(h.invoke('admin:sound','volume',1), /session expired/);
  await assert.rejects(h.invoke('covers:apply', 'test-game', 'xenia-manager', '4D5307E6', 'boxart'), /session expired/);
  await assert.rejects(h.untrusted('covers:search', 'test-game', 'xenia-manager'), /Untrusted/);
  for (const call of [['xenia:roms-add'], ['xenia:roms-remove', '/roms'], ['xenia:roms-rescan'], ['xenia:updates-own']]) {
    await assert.rejects(h.invoke(...call), /session expired/);
    await assert.rejects(h.untrusted(...call), /Untrusted/);
  }
  assert.equal(h.calls.length, 0);
  await h.invoke('admin:unlock', '1234', 'xenia');
  h.setResult({ canceled: false, filePaths: ['/games/a', '/games/b', 'relative'] });
  const added = await h.invoke('xenia:roms-add');
  assert.deepEqual(Array.from(added.folders), ['/games/a', '/games/b'], 'several folders at once; relative paths are ignored');
  assert.deepEqual(Array.from(h.calls[0].properties), ['openDirectory', 'multiSelections', 'dontAddToRecent']);
  assert.deepEqual(Array.from((await h.invoke('xenia:roms-add')).folders), ['/games/a', '/games/b'], 'a folder already listed is not added twice');
  h.setResult({ canceled: true, filePaths: [] });
  assert.deepEqual(Array.from((await h.invoke('xenia:roms-add')).folders), ['/games/a', '/games/b'], 'cancelling changes nothing');
  assert.deepEqual(Array.from((await h.invoke('admin:settings')).rom_directories), ['/games/a', '/games/b']);
  await assert.rejects(h.invoke('xenia:roms-remove', '/nope'), /not in the list/);
  assert.deepEqual(Array.from((await h.invoke('xenia:roms-remove', '/games/a')).folders), ['/games/b']);
  await h.invoke('xenia:roms-rescan');
  await h.invoke('admin:lock');
  await assert.rejects(h.invoke('xenia:roms-add'), /session expired/);
});
test('the sound volume is an app setting: validated, kept when the wallpaper changes',async()=>{
  const h=await mainHarness(true);await h.invoke('admin:unlock','1234');
  for(const bad of [NaN,2,-.1,'0.5',null,undefined])await assert.rejects(h.invoke('admin:sound','volume',bad),/Invalid sound setting/,String(bad));
  const changed=await h.invoke('admin:sound','volume',.25);assert.equal(changed.audio.volume,.25);
  const selected=await h.invoke('admin:theme-select',null);assert.equal(selected.audio.volume,.25);
  assert.equal((await h.invoke('admin:skin','metro-v1')).audio.volume,.25,'another look keeps it too');
  assert.equal(h.hasHandler('admin:theme-audio'),false);
  await h.invoke('admin:lock');await assert.rejects(h.invoke('admin:sound','volume',1),/expired/);
});
test('picker cannot return a path after PIN session expires while it is open', async () => {
  const h = await mainHarness();
  await h.invoke('admin:unlock', '1234', 'xenia');
  h.setResult(() => { h.setTime(1300001); return { canceled: false, filePaths: ['C:\\private'] }; });
  await assert.rejects(h.invoke('xenia:roms-add'), /session expired/);
});
test('admin editing allows clipboard shortcuts; kiosk still blocks devtools and modifiers', async () => {
  const h = await mainHarness();
  const blocked = input => { let prevented = false; h.events.get('before-input-event')({ preventDefault: () => { prevented = true; } }, { key: 'v', control: true, ...input }); return prevented; };
  assert.equal(blocked({}), true);
  await h.invoke('admin:unlock', '1234');
  assert.equal(blocked({}), false);
  assert.equal(blocked({ key: 'i', shift: true }), true);
  assert.equal(blocked({ key: 'F12', control: false }), true);
  assert.equal(blocked({ key: 'Escape', control: false }), false);
  await h.invoke('admin:lock');
  assert.equal(blocked({}), true);
});
test('game startup keeps the kiosk fullscreen underneath Xenia; exit restores focus once', async () => {
  const h = await mainHarness();
  await h.invoke('game:launch', 'test-game');
  h.emulator.emit('spawn');
  assert.deepEqual(h.windowCalls, [['topmost',true],['topmost',false],['state', true]]);
  await assert.rejects(h.invoke('game:launch', 'test-game'), /already running/);
  h.emulator.emit('close', 0);
  assert.deepEqual(h.windowCalls, [['topmost',true],['topmost',false],['state', true], ['restore'], ['show'], ['kiosk', true], ['fullscreen', true], ['focus'], ['state', false]]);
  h.emulator.emit('error', new Error('late error'));
  assert.equal(h.windowCalls.filter(call => call[0] === 'restore').length, 1);
});

test('rescanning covers needs the Dashboard session and refreshes the library',async()=>{
  const h=await mainHarness(false,'cached');
  await assert.rejects(h.invoke('admin:cover-rescan'),/session expired/);
  await assert.rejects(h.untrusted('admin:cover-rescan'),/Untrusted/);
  await h.invoke('admin:unlock','1234');
  assert.equal((await h.invoke('admin:cover-rescan')).length,1);
  assert.equal(h.hasHandler('admin:cover-search'),false,'the old per-source calls are gone: one cover manager');
  assert.equal(h.hasHandler('admin:cover-download'),false);
});

test('PIN attempts are throttled and changing PIN protection remains admin-only',async()=>{
 const h=await mainHarness();for(let i=0;i<5;i++)await assert.rejects(h.invoke('admin:unlock','9999'),/Incorrect/);
 await assert.rejects(h.invoke('admin:unlock','1234'),/Too many/);h.setTime(1030001);await h.invoke('admin:unlock','1234');await h.invoke('admin:lock');await assert.rejects(h.invoke('admin:pin-protection',false),/session expired/);
 assert.equal(h.hasHandler('admin:theme-builtin'),false);
});

test('automatic covers download by title ID once per title, require admin and say how many were not found',async()=>{
  const h=await mainHarness(false,'none',{title_id:'4D5307D5',uses_fallback_art:true});
  await assert.rejects(h.invoke('admin:cover-auto','xenia-manager'),/session expired/);
  await assert.rejects(h.untrusted('admin:cover-auto','xenia-manager'),/Untrusted/);
  await h.invoke('admin:unlock','1234');
  await assert.rejects(h.invoke('admin:cover-auto','nope'),/Unknown cover source/);
  await assert.rejects(h.invoke('admin:cover-auto'),/Unknown cover source/);
  const result=await h.invoke('admin:cover-auto','xenia-manager');
  assert.equal(result.downloaded,1);assert.equal(result.missing,0);
  assert.equal(result.games[0].uses_fallback_art,false);
  assert.equal((await h.invoke('admin:cover-auto','xenia-manager')).downloaded,0,'covers that exist are left alone');
  assert.equal((await h.invoke('admin:cover-auto','xenia-manager',true)).downloaded,1,'redownload replaces covers that already exist');
  assert.equal((await h.invoke('library:get')).auto_cover_source,'xenia-manager');
  const noId=await mainHarness(false,'none',{uses_fallback_art:true});await noId.invoke('admin:unlock','1234');
  assert.deepEqual([(await noId.invoke('admin:cover-auto','xenia-manager')).downloaded,(await noId.invoke('admin:cover-auto','xenia-manager')).missing],[0,1],'a game without a title ID is reported, not guessed');
});
test('automatic covers can come from LaunchBox, or from LaunchBox first and then the Xenia Manager database',async t=>{
  const fsp=require('node:fs/promises'),os=require('node:os'),launchbox=require('../src/launchbox');
  const dir=await fsp.mkdtemp(path.join(os.tmpdir(),'xd-lbauto-'));t.after(()=>fsp.rm(dir,{recursive:true,force:true}));
  const jpeg=Buffer.concat([Buffer.from([0xff,0xd8,0xff,0xe0]),Buffer.alloc(40,5)]);
  const fresh=async(titleId='4D5307D5')=>{const h=await mainHarness(false,'none',{title:'Test Game',title_id:titleId,uses_fallback_art:true},{userData:dir});h.routes.set('https://images.launchbox-app.com/front.jpg',()=>new Response(jpeg));await h.invoke('admin:unlock','1234');return h;};
  const h=await fresh();
  await assert.rejects(h.invoke('admin:cover-auto','launchbox'),/LaunchBox needs its data first/);
  await launchbox.writeIndex(path.join(dir,'launchbox'),[{id:'77',name:'Test Game',images:[{file:'front.jpg',type:'Box - Front',region:'North America'}]}]);
  const result=await (await fresh()).invoke('admin:cover-auto','launchbox');
  assert.deepEqual([result.downloaded,result.missing],[1,0]);assert.equal(result.games[0].uses_fallback_art,false);
  assert.equal((await h.invoke('library:get')).auto_cover_source,'launchbox','nothing is remembered until a download runs');
  // No whole-name match: LaunchBox alone leaves the game alone, 'both' falls back to the Xenia Manager database.
  await launchbox.writeIndex(path.join(dir,'launchbox'),[{id:'78',name:'Another Game',images:[{file:'front.jpg',type:'Box - Front',region:''}]}]);
  const alone=await (await fresh()).invoke('admin:cover-auto','launchbox');assert.deepEqual([alone.downloaded,alone.missing],[0,1]);
  const both=await (await fresh()).invoke('admin:cover-auto','both');assert.deepEqual([both.downloaded,both.missing],[1,0]);
});
test('Xenia settings IPC is admin-only, trusted-caller-only and explains a missing config',async()=>{
  const h=await mainHarness(false,'none',{title_id:'4D5307D5'});
  await assert.rejects(h.invoke('xenia:settings',null),/session expired/);
  await assert.rejects(h.invoke('xenia:set',null,'Display.fullscreen',false),/session expired/);
  await assert.rejects(h.invoke('xenia:reset','test-game','Display.fullscreen'),/session expired/);
  await assert.rejects(h.untrusted('xenia:set',null,'Display.fullscreen',false),/Untrusted/);
  await h.invoke('admin:unlock','1234');
  await assert.rejects(h.invoke('xenia:settings','missing-game'),/Unknown game|has not created|portable/);
  await assert.rejects(h.invoke('xenia:settings',null),/has not created xenia\.config\.toml|has not created/);
});
test('music and sound effects are two separate on/off switches of the app, for every look',async()=>{
  const h=await mainHarness(true);
  assert.deepEqual({...(await h.invoke('theme:get')).sound},{music:true,effects:true});
  await assert.rejects(h.invoke('admin:sound','music',false),/session expired/);
  await assert.rejects(h.untrusted('admin:sound','music',false),/Untrusted/);
  await h.invoke('admin:unlock','1234','xenia');
  await assert.rejects(h.invoke('admin:sound','music',false),/session expired/,'a Xenia session is not enough');
  await h.invoke('admin:lock');await h.invoke('admin:unlock','1234','dashboard');
  for(const [kind,value] of [['volume',true],['music','off'],['effects',null],[undefined,true],['music',undefined]])await assert.rejects(h.invoke('admin:sound',kind,value),/Invalid sound setting/,`${kind} ${value}`);
  assert.deepEqual({...(await h.invoke('admin:sound','music',false)).sound},{music:false,effects:true});
  assert.deepEqual({...(await h.invoke('admin:sound','effects',false)).sound},{music:false,effects:false});
  assert.deepEqual({...(await h.invoke('admin:sound','music',true)).sound},{music:true,effects:false});
  // They do not depend on the look: a look without a theme pack keeps them too.
  assert.deepEqual({...(await h.invoke('admin:skin','metro-v1')).sound},{music:true,effects:false});
  assert.deepEqual({...(await h.invoke('admin:sound','effects',true)).sound},{music:true,effects:true});
});

test('a library saved with the old single mute keeps it: both switches start off',async()=>{
  const h=await mainHarness(true,'none',{},{legacyMuted:true});
  assert.deepEqual({...(await h.invoke('theme:get')).sound},{music:false,effects:false});
});

test('notifications for the screen are handed over once and only to the app window',async()=>{
  const h=await mainHarness(true);
  await assert.rejects(h.untrusted('notices:take'),/Untrusted/);
  assert.deepEqual(Array.from(await h.invoke('notices:take')),[],'nothing is waiting when no Xenia is out of date');
  assert.deepEqual(Array.from(await h.invoke('notices:take')),[]);
});

test('the notification time is an app setting from 0 to 5 seconds in half-second steps, five by default',async()=>{
  const h=await mainHarness(true);
  assert.equal((await h.invoke('theme:get')).notice_seconds,5);
  await assert.rejects(h.invoke('admin:sound','notice_seconds',2),/session expired/);
  await assert.rejects(h.untrusted('admin:sound','notice_seconds',2),/Untrusted/);
  await h.invoke('admin:unlock','1234','dashboard');
  for(const bad of [-.5,5.5,.25,1.3,NaN,'2',true,null,undefined])await assert.rejects(h.invoke('admin:sound','notice_seconds',bad),/Invalid sound setting/,String(bad));
  for(const good of [0,.5,2.5,5])assert.equal((await h.invoke('admin:sound','notice_seconds',good)).notice_seconds,good);
  assert.equal((await h.invoke('admin:skin','metro-v1')).notice_seconds,5,'the setting is the same for any look');
});

test('the boot animation follows the theme by default, can be off or fixed to one look, and rides along with the theme',async()=>{
  const h=await mainHarness(true);
  assert.equal((await h.invoke('theme:get')).boot_animation,'theme');
  await assert.rejects(h.invoke('admin:boot-animation','off'),/session expired/);
  await assert.rejects(h.untrusted('admin:boot-animation','off'),/Untrusted/);
  await h.invoke('admin:unlock','1234','xenia');
  await assert.rejects(h.invoke('admin:boot-animation','off'),/session expired/,'a Xenia session is not enough');
  await h.invoke('admin:lock');await h.invoke('admin:unlock','1234','dashboard');
  for(const bad of [true,false,0,null,undefined,'','Blades','../x'])await assert.rejects(h.invoke('admin:boot-animation',bad),/Invalid boot animation/,String(bad));
  assert.equal((await h.invoke('admin:boot-animation','off')).boot_animation,'off');
  assert.equal((await h.invoke('admin:boot-animation','blades')).boot_animation,'blades');
  assert.equal((await h.invoke('admin:skin','nxe')).boot_animation,'blades','changing the look does not touch a fixed choice');
  assert.equal((await h.invoke('theme:get')).boot_animation,'blades');
  assert.equal((await h.invoke('admin:boot-animation','theme')).boot_animation,'theme');
});

test('skin assets are served from skins/<name>/assets only, with no way out of it',()=>{
  const {appFile}=require('../src/local-assets');
  for(const ok of ['skins/blades/assets/blade-header.png','skins/blades/assets/swirl/01.png','skins/blades/assets/MC360.ttf','skins/nxe/assets/boot.webm','skins/blades/assets/back.wav','index.html'])assert.ok(appFile(ok),ok);
  for(const bad of ['skins/blades/assets/../../main.js','skins/blades/assets/a/b/c.png','skins/blades/x.png','skins/blades/assets/run.js','skins/../assets/x.png','main.js','skins/Blades/assets/x.png'])assert.ok(!appFile(bad),bad);
});

test('Blades brings its own sounds and drops the NXE wallpapers, glyphs and pictograms',async()=>{
  const h=await mainHarness(true);
  await h.invoke('admin:unlock','1234','dashboard');
  const state=await h.invoke('admin:skin','blades');
  assert.deepEqual([...state.backgrounds],[]);assert.deepEqual({...state.icons},{});
  for (const n of [1, 2, 3, 4]) assert.match(state.sounds[`slide${n}`],new RegExp(`/bladeslide-${n}\\.wav$`),`arriving at blade ${n} is its own swoosh, the pitch rising`);
  assert.match(state.sounds.focus,/\/cursor\.wav$/,'moving through a menu is the soft boop, like the game list');
  assert.equal(state.sounds.left,state.sounds.focus,'the game list and the menus share the soft boop');assert.equal(state.sounds.right,state.sounds.focus);
  assert.notEqual(state.sounds.slide1,state.sounds.focus,'only changing blade is a swoosh');
  for(const url of Object.values(state.sounds))assert.ok(require('node:fs').existsSync(require('node:path').join(__dirname,'..',url.replace('nxe-app://dashboard/',''))),url);
});

test('Kinect brings its own sounds and button legends, and no NXE wallpapers or pictograms',async()=>{
  const h=await mainHarness(true);
  await h.invoke('admin:unlock','1234','dashboard');
  const state=await h.invoke('admin:skin','kinect');
  assert.equal(state.skin,'kinect');assert.deepEqual([...state.backgrounds],[]);assert.deepEqual({...state.icons},{});
  assert.match(state.sounds.slide,/\/kinect\/assets\/channel\.wav$/,'changing channel is one sound for every section');
  for(const role of ['focus','left','right','select','back','open','close'])assert.ok(state.sounds[role],role);
  for(const key of ['A','B','X','Y'])assert.match(state.buttons[key],new RegExp(`/kinect/assets/button-${key.toLowerCase()}\\.png$`));
  for(const url of [...Object.values(state.sounds),...Object.values(state.buttons)])assert.ok(require('node:fs').existsSync(require('node:path').join(__dirname,'..',url.replace('nxe-app://dashboard/',''))),url);
});

test('Metro V1 shares the Kinect sounds and brings its own button legends',async()=>{
  const h=await mainHarness(true);
  await h.invoke('admin:unlock','1234','dashboard');
  const kinect=await h.invoke('admin:skin','kinect'),metro=await h.invoke('admin:skin','metro-v1');
  assert.equal(metro.skin,'metro-v1');assert.deepEqual({...metro.sounds},{...kinect.sounds});assert.deepEqual([...metro.backgrounds],[]);
  for(const key of ['A','B','X','Y']){assert.match(metro.buttons[key],new RegExp(`/metro-v1/assets/button-${key.toLowerCase()}\\.png$`));assert.ok(require('node:fs').existsSync(require('node:path').join(__dirname,'..',metro.buttons[key].replace('nxe-app://dashboard/',''))));}
});

test('NXE draws with its pack (wallpapers, legends, tile textures) and adds the channel-change sound',async()=>{
  const h=await mainHarness(true);
  const nxe=await h.invoke('theme:get');
  assert.equal(nxe.skin,'nxe');assert.ok(nxe.backgrounds.length>0);assert.match(nxe.sounds.slide,/\/skins\/nxe\/assets\/channel\.wav$/);
  assert.ok(require('node:fs').existsSync(require('node:path').join(__dirname,'..','skins/nxe/assets/channel.wav')));
});

test('animations default to on, are admin-only, validated, and ride along with every theme response',async()=>{
  const h=await mainHarness(true);
  assert.equal((await h.invoke('theme:get')).animations,'on');
  await assert.rejects(h.invoke('admin:animations','off'),/session expired/);
  await assert.rejects(h.untrusted('admin:animations','off'),/Untrusted/);
  await h.invoke('admin:unlock','1234');
  await assert.rejects(h.invoke('admin:animations','sometimes'),/Invalid animation/);
  await assert.rejects(h.invoke('admin:animations',true),/Invalid animation/);
  assert.equal((await h.invoke('admin:animations','system')).animations,'system');
  assert.equal((await h.invoke('theme:get')).animations,'system');
  assert.equal((await h.invoke('admin:theme-select',null)).animations,'system');
  assert.equal((await h.invoke('admin:sound','volume',.5)).animations,'system');
  assert.equal((await h.invoke('admin:animations','off')).animations,'off');
});

test('admin sessions are scoped to a section and each section obeys its own PIN lock',async()=>{
  const h=await mainHarness();
  assert.equal((await h.invoke('admin:access')).pin_required,true);
  assert.equal((await h.invoke('admin:access','xenia')).pin_required,true);
  await assert.rejects(h.invoke('admin:access','bogus'),/Unknown section/);
  await assert.rejects(h.invoke('xenia:settings',null),/session expired/);
  await assert.rejects(h.invoke('admin:unlock','0000','xenia'),/Incorrect PIN/);
  await assert.rejects(h.invoke('admin:unlock','1234','bogus'),/Unknown section/);
  await h.invoke('admin:unlock','1234','xenia');
  assert.deepEqual(Array.from((await h.invoke('admin:settings')).rom_directories),[], 'Locations belong to the Xenia section');
  await assert.rejects(h.invoke('admin:security'),/session expired/,'a Xenia session cannot reach the PIN screen');
  await assert.rejects(h.invoke('admin:set-pin','5678'),/session expired/);
  await assert.rejects(h.invoke('admin:pin-protection',false),/session expired/);
  await assert.rejects(h.invoke('admin:cover-auto','xenia-manager'),/session expired/,'the bulk cover download is a Dashboard call');
  await assert.rejects(h.invoke('admin:exit'),/session expired/);
  await assert.rejects(h.invoke('xenia:settings',null),/has not created/,'but it passes the gate for Xenia calls');
  await h.invoke('admin:lock');
  await h.invoke('admin:unlock','1234','dashboard');
  assert.deepEqual(Array.from((await h.invoke('admin:security')).locked_sections),['xenia','dashboard']);
  await assert.rejects(h.invoke('admin:settings'),/session expired/,'and a Dashboard session cannot read or change Folders');
  await assert.rejects(h.invoke('xenia:roms-add'),/session expired/);
  await assert.rejects(h.invoke('xenia:settings',null),/session expired/,'and a Dashboard session cannot reach Xenia');
  await assert.rejects(h.invoke('admin:section-lock','xenia','no'),/Invalid section lock/);
  await assert.rejects(h.invoke('admin:section-lock','library',false),/Invalid section lock/);
  assert.deepEqual(Array.from((await h.invoke('admin:section-lock','xenia',false)).locked_sections),['dashboard']);
  await h.invoke('admin:lock');
  await assert.rejects(h.invoke('admin:section-lock','xenia',true),/session expired/);
  assert.equal((await h.invoke('admin:access','xenia')).pin_required,false);
  assert.equal((await h.invoke('admin:access','dashboard')).pin_required,true);
  assert.equal((await h.invoke('admin:access')).pin_required,true,'the Admin button still needs the PIN');
  await h.invoke('admin:unlock','','xenia');
  await assert.rejects(h.invoke('xenia:settings',null),/has not created/);
  await assert.rejects(h.invoke('admin:security'),/session expired/);
  await assert.rejects(h.invoke('admin:unlock','','dashboard'),/Incorrect PIN/);
  await assert.rejects(h.invoke('admin:unlock',''),/Incorrect PIN/);
  h.setTime(1000000+300001);
  await assert.rejects(h.invoke('xenia:settings',null),/session expired/);
});
test('turning PIN protection off opens every section and a full session still covers all of them',async()=>{
  const h=await mainHarness();await h.invoke('admin:unlock','1234');
  await h.invoke('xenia:settings',null).catch(error=>assert.match(error.message,/has not created/));
  await h.invoke('admin:settings');await h.invoke('admin:security');
  await h.invoke('admin:pin-protection',false);await h.invoke('admin:lock');
  for(const section of ['xenia','dashboard',undefined])assert.equal((await h.invoke('admin:access',section)).pin_required,false);
  await h.invoke('admin:unlock','', 'dashboard');await h.invoke('admin:security');
});

test('the PIN changes only from a Dashboard session, with its own validated call',async()=>{
  const h=await mainHarness();
  await assert.rejects(h.invoke('admin:set-pin','5678'),/session expired/);
  await assert.rejects(h.untrusted('admin:set-pin','5678'),/Untrusted/);
  await h.invoke('admin:unlock','1234','dashboard');
  for(const bad of ['12','123456789','abcd','12 34',1234,null])await assert.rejects(h.invoke('admin:set-pin',bad),/PIN must be 4–8 digits/);
  assert.equal(await h.invoke('admin:set-pin','5678'),true);
  await h.invoke('admin:lock');
  await assert.rejects(h.invoke('admin:unlock','1234','dashboard'),/Incorrect PIN/);
  await h.invoke('admin:unlock','5678','dashboard');
  assert.equal((await h.invoke('admin:security')).admin_pin_required,true);
});
test('closing the window (Alt+F4): quits when no PIN guards the Dashboard, otherwise asks through the exit window, never during a game',async()=>{
  const h=await mainHarness(),close=()=>{let prevented=false;h.windowEvents.get('close')({preventDefault(){prevented=true;}});return prevented;};
  const quits=()=>h.windowCalls.filter(call=>call[0]==='quit').length,asked=()=>h.windowCalls.filter(call=>call[0]==='app:close-request').length;
  assert.equal(close(),true,'with the PIN on the window does not just vanish');
  assert.equal(quits(),0);assert.equal(asked(),1,'the dashboard is asked to show the exit window');
  await h.invoke('admin:unlock','1234','dashboard');
  await h.invoke('admin:pin-protection',false);
  await h.invoke('admin:lock');
  assert.equal(close(),true);assert.equal(quits(),1,'with the PIN off it closes');assert.equal(asked(),1);
  assert.equal(close(),false,'once quitting has been allowed the window really closes');
});
test('Alt+F4 does nothing while a game runs, and a Dashboard-only lock still counts',async()=>{
  const h=await mainHarness(),close=()=>{let prevented=false;h.windowEvents.get('close')({preventDefault(){prevented=true;}});return prevented;};
  const quits=()=>h.windowCalls.filter(call=>call[0]==='quit').length,asked=()=>h.windowCalls.filter(call=>call[0]==='app:close-request').length;
  await h.invoke('admin:unlock','1234','dashboard');
  await h.invoke('admin:section-lock','dashboard',false);await h.invoke('admin:lock');
  assert.equal(close(),true);assert.equal(quits(),1,'the Dashboard lock is off, so nothing guards leaving');
});
test('Alt+F4 during a running game is ignored',async()=>{
  const h=await mainHarness();
  await h.invoke('game:launch','test-game');
  let prevented=false;h.windowEvents.get('close')({preventDefault(){prevented=true;}});
  assert.equal(prevented,true);
  assert.equal(h.windowCalls.filter(call=>call[0]==='quit'||call[0]==='app:close-request').length,0);
});

// ---- Xenia Settings › Updates: install and update Xenia itself, against a pretend GitHub
const crypto = require('node:crypto');
const sha = buffer => crypto.createHash('sha256').update(buffer).digest('hex');
const ELF = Buffer.concat([Buffer.from([0x7f, 0x45, 0x4c, 0x46]), Buffer.from('pretend appimage')]);
function pretendGithub(h, tag, bytes, { badDigest = false } = {}) {
  const name = 'xenia_edge_linux.AppImage', url = `https://github.com/has207/xenia-edge/releases/download/${tag}/${name}`;
  h.routes.set('https://api.github.com/repos/has207/xenia-edge/releases/latest', () => new Response(JSON.stringify({ tag_name: tag, published_at: '2026-10-13T07:00:00Z', body: '- [Net] Something', assets: [{ name, size: bytes.length, digest: `sha256:${badDigest ? '0'.repeat(64) : sha(bytes)}`, browser_download_url: url }] })));
  h.routes.set(url, () => new Response(null, { status: 302, headers: { location: `https://release-assets.githubusercontent.com/blob/${tag}` } }));
  h.routes.set(`https://release-assets.githubusercontent.com/blob/${tag}`, () => new Response(bytes));
}
async function updatesHarness(t, options = {}) {
  const userData = await require('node:fs/promises').mkdtemp(path.join(require('node:os').tmpdir(), 'xd-updates-'));
  t.after(() => require('node:fs/promises').rm(userData, { recursive: true, force: true }));
  const h = await mainHarness(false, 'none', {}, { userData, platform: 'linux', ...options });
  return { h, userData };
}
test('Updates calls need the Xenia session from a trusted caller, and only known channels', async t => {
  const { h } = await updatesHarness(t);
  for (const call of [['xenia:updates-status'], ['xenia:updates-check', 'edge'], ['xenia:updates-install', 'edge'], ['xenia:updates-use', 'edge'], ['xenia:updates-rollback', 'edge']]) {
    await assert.rejects(h.invoke(...call), /session expired/);
    await assert.rejects(h.untrusted(...call), /Untrusted/);
  }
  await h.invoke('admin:unlock', '1234', 'dashboard');
  await assert.rejects(h.invoke('xenia:updates-status'), /session expired/, 'a Dashboard session is not enough');
  await h.invoke('admin:lock'); await h.invoke('admin:unlock', '1234', 'xenia');
  const status = await h.invoke('xenia:updates-status');
  assert.equal(status.platform, 'linux'); assert.equal(status.channels[0].id, 'edge'); assert.equal(status.channels[0].installed, null); assert.equal(status.channels[0].in_use, false);
  for (const bad of ['nightly', '__proto__', 'constructor', null, 7]) await assert.rejects(h.invoke('xenia:updates-check', bad), /Unknown Xenia channel/);
});
test('install downloads, verifies and installs, reports progress, and leaves an existing Xenia in use', async t => {
  const { h, userData } = await updatesHarness(t);
  pretendGithub(h, 'aaa1111', ELF);
  await h.invoke('admin:unlock', '1234', 'xenia');
  const found = await h.invoke('xenia:updates-check', 'edge');
  assert.deepEqual([found.tag, found.asset.name, found.notes], ['aaa1111', 'xenia_edge_linux.AppImage', '[Net] Something']);
  const status = await h.invoke('xenia:updates-install', 'edge');
  const edge = status.channels[0];
  assert.equal(edge.installed.tag, 'aaa1111'); assert.equal(edge.in_use, false, 'the Xenia the user already had keeps being used');
  assert.equal(status.configured, 'C:\\Xenia\\xenia.exe');
  assert.equal(edge.executable, path.join(userData, 'home', '.local', 'share', 'xenia-dashboard', 'xenia', 'edge', 'xenia_edge_linux.AppImage'));
  assert.deepEqual(await require('node:fs/promises').readFile(edge.executable), ELF);
  assert.ok(h.windowCalls.some(call => call[0] === 'updates:progress'), 'the screen is told about the download');
  const used = await h.invoke('xenia:updates-use', 'edge');
  assert.equal(used.channels[0].in_use, true); assert.equal(used.configured, edge.executable);
});
test('the first install on a machine with no Xenia configured is used right away', async t => {
  const { h } = await updatesHarness(t, { executable: '' });
  pretendGithub(h, 'bbb2222', ELF);
  await h.invoke('admin:unlock', '1234', 'xenia');
  const status = await h.invoke('xenia:updates-install', 'edge');
  assert.equal(status.channels[0].in_use, true); assert.match(status.configured, /xenia_edge_linux\.AppImage$/);
});
test('a download that fails its checksum installs nothing, and updates keep a version to go back to', async t => {
  const { h } = await updatesHarness(t);
  await h.invoke('admin:unlock', '1234', 'xenia');
  pretendGithub(h, 'ccc3333', ELF, { badDigest: true });
  await assert.rejects(h.invoke('xenia:updates-install', 'edge'), /Checksum mismatch/);
  assert.equal((await h.invoke('xenia:updates-status')).channels[0].installed, null);
  await assert.rejects(h.invoke('xenia:updates-rollback', 'edge'), /no earlier version/);
  pretendGithub(h, 'ddd4444', ELF); await h.invoke('xenia:updates-install', 'edge');
  pretendGithub(h, 'eee5555', Buffer.concat([ELF, Buffer.from('2')]));
  const updated = await h.invoke('xenia:updates-install', 'edge');
  assert.deepEqual([updated.channels[0].installed.tag, updated.channels[0].previous.tag], ['eee5555', 'ddd4444']);
  const back = await h.invoke('xenia:updates-rollback', 'edge');
  assert.deepEqual([back.channels[0].installed.tag, back.channels[0].previous.tag], ['ddd4444', 'eee5555']);
});
test('installing is refused while a game is running, and a release without a checksum is refused', async t => {
  const { h } = await updatesHarness(t);
  await h.invoke('admin:unlock', '1234', 'xenia');
  const bytes = ELF, name = 'xenia_edge_linux.AppImage';
  h.routes.set('https://api.github.com/repos/has207/xenia-edge/releases/latest', () => new Response(JSON.stringify({ tag_name: 'fff6666', assets: [{ name, size: bytes.length, browser_download_url: `https://github.com/has207/xenia-edge/releases/download/fff6666/${name}` }] })));
  await assert.rejects(h.invoke('xenia:updates-check', 'edge'), /no checksum/);
  await assert.rejects(h.invoke('xenia:updates-install', 'edge'), /no checksum/);
  await h.invoke('game:launch', 'test-game');           // launching a game also ends the admin session
  await h.invoke('admin:unlock', '1234', 'xenia');
  pretendGithub(h, 'ggg7777', ELF);
  await assert.rejects(h.invoke('xenia:updates-install', 'edge'), /Close the running game/);
});
test('on a system without a build the channel says so instead of failing', async t => {
  const { h } = await updatesHarness(t, { platform: 'darwin' });
  await h.invoke('admin:unlock', '1234', 'xenia');
  const status = await h.invoke('xenia:updates-status');
  assert.equal(status.platform, null); assert.equal(status.channels[0].supported, false);
  await assert.rejects(h.invoke('xenia:updates-check', 'edge'), /no build for this system/);
});

test('the update check says which official build the dashboard is launching today', async t => {
  const fsp = require('node:fs/promises'), os = require('node:os');
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'xd-mine-')); t.after(() => fsp.rm(dir, { recursive: true, force: true }));
  const mine = path.join(dir, 'my-edge.AppImage'); await fsp.writeFile(mine, ELF);
  const { h } = await updatesHarness(t, { executable: mine });
  pretendGithub(h, 'new9999', Buffer.concat([ELF, Buffer.from('newer')]));
  await h.invoke('admin:unlock', '1234', 'xenia');
  assert.equal((await h.invoke('xenia:updates-check', 'edge')).current_tag, null, 'a build nobody published stays unidentified');
  pretendGithub(h, 'cur0001', ELF);
  const found = await h.invoke('xenia:updates-check', 'edge');
  assert.deepEqual([found.tag, found.current_tag], ['cur0001', 'cur0001']);
});

// ---- Game menu › Optimized settings
const JUDGMENT = `# Title Name: Gears of War - Judgement
# Title ID: 4D530A26

[GPU]
draw_resolution_scale_threshold = 360 # Fixes post-process effects.
occlusion_query = "strict" # Fixes unoccluded lens flares
vsync = false # Unlocks framerate
`;
async function optimizedHarness(t, gameExtra = { title_id: '4D530A26' }) {
  const fsp = require('node:fs/promises'), os = require('node:os');
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'xd-opt-')); t.after(() => fsp.rm(dir, { recursive: true, force: true }));
  await fsp.writeFile(path.join(dir, 'portable.txt'), ''); await fsp.copyFile(path.join(__dirname, 'fixtures', 'xenia-edge.config.toml'), path.join(dir, 'xenia-edge.config.toml'));
  const h = await mainHarness(false, 'none', gameExtra, { platform: 'linux', executable: path.join(dir, 'xenia_edge_linux.AppImage') });
  const base = 'https://raw.githubusercontent.com/xenia-manager/optimized-settings/main/';
  h.routes.set(`${base}settings/4D530A26.toml`, () => new Response(JUDGMENT));
  h.routes.set(`${base}data/settings.json`, () => new Response(JSON.stringify([{ id: '4D530A26', title: 'Gears of War - Judgement', last_modified: '2026-10-02' }])));
  return { h, dir, base, gameFile: path.join(dir, 'config', '4D530A26.config.toml') };
}
test('checking optimized settings needs the Xenia session and shows exactly what would change', { skip: process.platform === 'win32' && 'emulates a Linux host with real folders' }, async t => {
  const { h } = await optimizedHarness(t);
  await assert.rejects(h.invoke('xenia:optimized-check', 'test-game'), /session expired/);
  await assert.rejects(h.untrusted('xenia:optimized-check', 'test-game'), /Untrusted/);
  await h.invoke('admin:unlock', '1234', 'dashboard');
  await assert.rejects(h.invoke('xenia:optimized-check', 'test-game'), /session expired/, 'a Dashboard session is not enough');
  await h.invoke('admin:lock'); await h.invoke('admin:unlock', '1234', 'xenia');
  const view = await h.invoke('xenia:optimized-check', 'test-game');
  assert.equal(view.available, true); assert.equal(view.modified, '2026-10-02'); assert.equal(view.title, 'Gears of War - Judgement');
  assert.deepEqual(view.changes.map(change => [change.name, change.to]), [['GPU › draw_resolution_scale_threshold', 360], ['GPU › occlusion_query', 'strict']]);
  assert.deepEqual(view.skipped.map(item => item.key), ['vsync']);
  await assert.rejects(h.invoke('xenia:optimized-check', 'nope'), /Unknown game/);
});
test('applying writes only this game\'s override file, once, and never while a game runs', { skip: process.platform === 'win32' && 'emulates a Linux host with real folders' }, async t => {
  const { h, gameFile, base } = await optimizedHarness(t), fsp = require('node:fs/promises');
  await assert.rejects(h.invoke('xenia:optimized-apply', 'test-game'), /session expired/);
  await h.invoke('admin:unlock', '1234', 'xenia');
  const before = await fsp.readFile(path.join(path.dirname(gameFile), '..', 'xenia-edge.config.toml'), 'utf8');
  assert.deepEqual({ ...(await h.invoke('xenia:optimized-apply', 'test-game')) }, { applied: 2, skipped: 1 });
  const written = await fsp.readFile(gameFile, 'utf8');
  assert.match(written, /\[GPU\]/); assert.match(written, /occlusion_query = "strict"/); assert.match(written, /draw_resolution_scale_threshold = 360/); assert.doesNotMatch(written, /vsync/);
  assert.equal(await fsp.readFile(path.join(path.dirname(gameFile), '..', 'xenia-edge.config.toml'), 'utf8'), before, 'the system config is untouched');
  assert.equal((await h.invoke('xenia:optimized-check', 'test-game')).changes.length, 0, 'applied settings count as current');
  await assert.rejects(h.invoke('xenia:optimized-apply', 'test-game'), /Nothing to change/);
  h.routes.set(`${base}settings/4D530A26.toml`, () => new Response('nope', { status: 404 }));
  await assert.rejects(h.invoke('xenia:optimized-apply', 'test-game'), /no community settings/);
  assert.equal((await h.invoke('xenia:optimized-check', 'test-game')).available, false);
  await h.invoke('game:launch', 'test-game'); await h.invoke('admin:unlock', '1234', 'xenia');
  await assert.rejects(h.invoke('xenia:optimized-apply', 'test-game'), /Close the running game/);
});
test('a game without a title ID cannot use community settings', { skip: process.platform === 'win32' && 'emulates a Linux host with real folders' }, async t => {
  const { h } = await optimizedHarness(t, {});
  await h.invoke('admin:unlock', '1234', 'xenia');
  await assert.rejects(h.invoke('xenia:optimized-check', 'test-game'), /no title ID/);
});

// ---- Game menu › DLC and updates
async function contentHarness(t, gameExtra = { title_id: '4D5307D5' }) {
  const fsp = require('node:fs/promises'), os = require('node:os');
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'xd-dlc-')); t.after(() => fsp.rm(dir, { recursive: true, force: true }));
  await fsp.writeFile(path.join(dir, 'portable.txt'), ''); await fsp.copyFile(path.join(__dirname, 'fixtures', 'xenia-edge.config.toml'), path.join(dir, 'xenia-edge.config.toml'));
  const roms = path.join(dir, 'roms'); await fsp.mkdir(roms);
  const pack = (type, titleId, name) => { const b = Buffer.alloc(0x4000, 3); b.fill(0, 0, 0x1800); b.write('LIVE', 0, 'latin1'); b.writeUInt32BE(type, 0x344); b.writeUInt32BE(titleId, 0x360); Buffer.from(name, 'utf16le').swap16().copy(b, 0x411); return b; };
  await fsp.writeFile(path.join(roms, 'dlc-map-pack'), pack(2, 0x4D5307D5, 'Map Pack'));
  await fsp.writeFile(path.join(roms, 'tu00000003'), pack(0xB0000, 0x4D5307D5, 'Title Update 3'));
  await fsp.writeFile(path.join(roms, 'other-game-dlc'), pack(2, 0x58410954, 'Someone else'));
  const h = await mainHarness(false, 'none', gameExtra, { platform: 'linux', executable: path.join(dir, 'xenia_edge_linux.AppImage'), romDirectory: roms });
  return { h, dir, roms, content: path.join(dir, 'content', '0000000000000000', '4D5307D5') };
}
test('DLC and updates: found packages are listed for this game only, behind the Xenia session', { skip: process.platform === 'win32' && 'emulates a Linux host with real folders' }, async t => {
  const { h } = await contentHarness(t);
  await assert.rejects(h.invoke('xenia:content-check', 'test-game'), /session expired/);
  await assert.rejects(h.untrusted('xenia:content-check', 'test-game'), /Untrusted/);
  await h.invoke('admin:unlock', '1234', 'dashboard');
  await assert.rejects(h.invoke('xenia:content-check', 'test-game'), /session expired/, 'a Dashboard session is not enough');
  await h.invoke('admin:lock'); await h.invoke('admin:unlock', '1234', 'xenia');
  const view = await h.invoke('xenia:content-check', 'test-game');
  assert.deepEqual(view.available.map(item => [item.name, item.kind, item.display_name, item.installed]), [['dlc-map-pack', 'dlc', 'Map Pack', false], ['tu00000003', 'update', 'Title Update 3', false]]);
  assert.deepEqual([...view.installed], []);
  await assert.rejects(h.invoke('xenia:content-check', 'nope'), /Unknown game/);
});
test('installing copies the package into the shared content folder and never takes an arbitrary path', { skip: process.platform === 'win32' && 'emulates a Linux host with real folders' }, async t => {
  const { h, roms, content } = await contentHarness(t), fsp = require('node:fs/promises');
  await assert.rejects(h.invoke('xenia:content-install', 'test-game', path.join(roms, 'tu00000003')), /session expired/);
  await h.invoke('admin:unlock', '1234', 'xenia');
  await assert.rejects(h.invoke('xenia:content-install', 'test-game', path.join(roms, 'tu00000003')), /not found for this game/, 'nothing is installable before the list was shown');
  await h.invoke('xenia:content-check', 'test-game');
  for (const bad of [path.join(roms, 'other-game-dlc'), '/etc/passwd', path.join(roms, '..', 'xenia-edge.config.toml'), 5, null, undefined]) await assert.rejects(h.invoke('xenia:content-install', 'test-game', bad), /not found for this game/, String(bad));
  const result = await h.invoke('xenia:content-install', 'test-game', path.join(roms, 'tu00000003'));
  assert.deepEqual({ ...result.done }, { kind: 'update', label: 'Title update', name: 'tu00000003' });
  assert.deepEqual(await fsp.readFile(path.join(content, '000B0000', 'tu00000003')), await fsp.readFile(path.join(roms, 'tu00000003')));
  assert.deepEqual(result.available.map(item => [item.name, item.installed]), [['dlc-map-pack', false], ['tu00000003', true]]);
  assert.deepEqual(result.installed.map(item => [item.kind, item.name]), [['update', 'tu00000003']], 'what Xenia has is listed afterwards');
  await assert.rejects(fsp.stat(path.join(content, '00000002')), 'only what was chosen is copied');
  await h.invoke('game:launch', 'test-game'); await h.invoke('admin:unlock', '1234', 'xenia');
  await assert.rejects(h.invoke('xenia:content-install', 'test-game', path.join(roms, 'dlc-map-pack')), /Close the running game/);
});
test('a game without a title ID has no DLC screen', { skip: process.platform === 'win32' && 'emulates a Linux host with real folders' }, async t => {
  const { h } = await contentHarness(t, {});
  await h.invoke('admin:unlock', '1234', 'xenia');
  await assert.rejects(h.invoke('xenia:content-check', 'test-game'), /no title ID/);
});

// ---- Cover manager (per game): every source behind the same calls
async function coverHarness(t) {
  const fsp = require('node:fs/promises'), os = require('node:os'), { makeZip } = require('./helpers/make-zip');
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'xd-cm-')); t.after(() => fsp.rm(dir, { recursive: true, force: true }));
  const png = path.join(dir, 'mine.png'), text = path.join(dir, 'notes.png');
  await fsp.writeFile(png, Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40, 1)])); await fsp.writeFile(text, 'just text, not an image');
  const xml = '<LaunchBox>\n  <Game>\n    <Name>Test Game</Name>\n    <DatabaseID>77</DatabaseID>\n    <Platform>Microsoft Xbox 360</Platform>\n  </Game>\n  <GameImage>\n    <DatabaseID>77</DatabaseID>\n    <FileName>front-na.jpg</FileName>\n    <Type>Box - Front</Type>\n    <Region>North America</Region>\n  </GameImage>\n  <GameImage>\n    <DatabaseID>77</DatabaseID>\n    <FileName>box3d.png</FileName>\n    <Type>Box - 3D</Type>\n    <Region>World</Region>\n  </GameImage>\n</LaunchBox>\n';
  const body = makeZip([['Metadata.xml', xml]]);
  const h = await mainHarness(false, 'none', { title_id: '4D5307D5' }, { platform: 'linux', executable: '/x/xenia', userData: dir });
  h.routes.set('https://gamesdb.launchbox-app.com/Metadata.zip', () => ({ ok: true, status: 200, headers: { get: name => name === 'content-length' ? String(body.length) : null }, body: (async function* () { yield body; })() }));
  h.routes.set('https://images.launchbox-app.com/front-na.jpg', () => new Response(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(40, 5)])));
  return { h, png, text };
}
test('the cover manager is guarded: per-game calls need the Xenia session, the shared ones any section', async t => {
  const { h } = await coverHarness(t);
  for (const call of [['covers:sources'], ['covers:prepare', 'launchbox'], ['covers:search', 'test-game', 'launchbox'], ['covers:pictures', 'test-game', 'launchbox', '77'], ['covers:preview', 'test-game', 'launchbox', '77', 'front-na.jpg'], ['covers:apply', 'test-game', 'launchbox', '77', 'front-na.jpg'], ['covers:local', 'test-game']]) await assert.rejects(h.invoke(...call), /session expired/, call[0]);
  await assert.rejects(h.untrusted('covers:sources'), /Untrusted/); await assert.rejects(h.untrusted('covers:local', 'test-game'), /Untrusted/);
  await h.invoke('admin:unlock', '1234', 'dashboard');
  assert.equal((await h.invoke('covers:sources')).length, 2, 'the bulk screen can list sources');
  await assert.rejects(h.invoke('covers:search', 'test-game', 'xenia-manager'), /session expired/, 'but a Dashboard session cannot change one game');
  await assert.rejects(h.invoke('covers:local', 'test-game'), /session expired/);
  await h.invoke('admin:lock'); await h.invoke('admin:unlock', '1234', 'xenia');
  await assert.rejects(h.invoke('admin:cover-auto', 'xenia-manager'), /session expired/, 'and a Xenia session cannot run the bulk download');
});
test('Xenia Manager through the cover manager: search, pictures, preview and apply to one game', async t => {
  const { h } = await coverHarness(t);
  await h.invoke('admin:unlock', '1234', 'xenia');
  assert.deepEqual(Array.from(await h.invoke('covers:sources')).map(source => [source.id, source.label, source.needs_download, source.ready]), [['launchbox', 'LaunchBox', true, false], ['xenia-manager', 'Xenia Manager', false, true]], 'LaunchBox is listed before Xenia Manager');
  assert.equal((await h.invoke('covers:search', 'test-game', 'xenia-manager'))[0].key, '12345678');
  await assert.rejects(h.invoke('covers:search', 'nope', 'xenia-manager'), /Unknown game/); await assert.rejects(h.invoke('covers:search', 'test-game', 'bogus'), /Unknown cover source/); await assert.rejects(h.invoke('covers:search', 'test-game'), /Unknown cover source/);
  assert.deepEqual((await h.invoke('covers:pictures', 'test-game', 'xenia-manager', '12345678')).map(item => item.key), ['boxart']);
  await assert.rejects(h.invoke('covers:pictures', 'test-game', 'xenia-manager', 'invalid'), /Unknown cover selection/);
  assert.match(await h.invoke('covers:preview', 'test-game', 'xenia-manager', '12345678', 'boxart'), /^kratos-art:\/\/preview\/\d+$/);
  const games = await h.invoke('covers:apply', 'test-game', 'xenia-manager', '12345678', 'boxart');
  assert.equal(games[0].uses_fallback_art, false); assert.match(games[0].cover_art_path, /^kratos-art:\/\/cover\/test-game/);
  await assert.rejects(h.invoke('covers:apply', 'test-game', 'xenia-manager', '12345678', 'other'), /Unknown picture/);
});
test('LaunchBox through the cover manager: download once, then search, preview and apply', async t => {
  const { h } = await coverHarness(t);
  await h.invoke('admin:unlock', '1234', 'xenia');
  await assert.rejects(h.invoke('covers:search', 'test-game', 'launchbox'), /Download the LaunchBox data first/);
  await assert.rejects(h.invoke('covers:prepare', 'xenia-manager'), /needs no download/);
  const ready = await h.invoke('covers:prepare', 'launchbox'); assert.deepEqual([ready.id, ready.ready, ready.games], ['launchbox', true, 1]);
  const found = await h.invoke('covers:search', 'test-game', 'launchbox'); assert.deepEqual([found[0].key, found[0].title], ['77', 'Test Game']);
  assert.deepEqual((await h.invoke('covers:pictures', 'test-game', 'launchbox', '77')).map(item => item.key), ['front-na.jpg', 'box3d.png']);
  await assert.rejects(h.invoke('covers:pictures', 'test-game', 'launchbox', '999'), /Unknown LaunchBox game/);
  for (const bad of ['../etc/passwd', 'other.jpg', 'https://evil.example/x.jpg']) await assert.rejects(h.invoke('covers:preview', 'test-game', 'launchbox', '77', bad), /Unknown LaunchBox picture/);
  const games = await h.invoke('covers:apply', 'test-game', 'launchbox', '77', 'front-na.jpg');
  assert.equal(games[0].uses_fallback_art, false); assert.match(games[0].cover_art_path, /^kratos-art:\/\/cover\/test-game/);
});
test('a cover can be chosen from a file on this computer', async t => {
  const { h, png, text } = await coverHarness(t);
  await h.invoke('admin:unlock', '1234', 'xenia');
  h.setResult({ canceled: true, filePaths: [] }); assert.equal(await h.invoke('covers:local', 'test-game'), null, 'cancelling changes nothing');
  h.setResult({ canceled: false, filePaths: [text] }); await assert.rejects(h.invoke('covers:local', 'test-game'), /JPEG, PNG or WebP/);
  h.setResult({ canceled: false, filePaths: [png] });
  const games = await h.invoke('covers:local', 'test-game');
  assert.equal(games[0].uses_fallback_art, false); assert.match(games[0].cover_art_path, /^kratos-art:\/\/cover\/test-game/);
  await assert.rejects(h.invoke('covers:local', 'nope'), /Unknown game/);
});

test('the install folder can be changed: builds move along, the launched Xenia follows, and the default can be restored', async t => {
  const { h, userData } = await updatesHarness(t, { executable: '' });
  const fs = require('node:fs/promises');
  pretendGithub(h, 'fff6666', ELF);
  await h.invoke('admin:unlock', '1234', 'xenia');
  const first = await h.invoke('xenia:updates-install', 'edge');
  assert.equal(first.install_is_default, true);
  const chosen = path.join(userData, 'elsewhere'); await fs.mkdir(chosen);
  h.setResult({ canceled: false, filePaths: [chosen] });
  const moved = await h.invoke('xenia:updates-folder', 'choose');
  const root = path.join(chosen, 'xenia');
  assert.equal(moved.install_root, root); assert.equal(moved.install_is_default, false);
  assert.equal(moved.channels[0].executable, path.join(root, 'edge', 'xenia_edge_linux.AppImage'));
  assert.equal(moved.configured, moved.channels[0].executable, 'the Xenia that is launched moved with it');
  assert.deepEqual(await fs.readFile(moved.configured), ELF); assert.equal(moved.channels[0].installed.tag, 'fff6666');
  await assert.rejects(fs.access(first.install_root), 'nothing is left behind');
  h.setResult({ canceled: true, filePaths: [] });
  assert.equal((await h.invoke('xenia:updates-folder', 'choose')).install_root, root, 'cancelling changes nothing');
  const back = await h.invoke('xenia:updates-folder', 'default');
  assert.equal(back.install_root, first.install_root); assert.equal(back.install_is_default, true);
  assert.deepEqual(await fs.readFile(back.configured), ELF);
  await assert.rejects(h.invoke('xenia:updates-folder', 'nowhere'), /Invalid action/);
});
test('Folders shows and changes Xenia\'s content folder; only the setting moves', { skip: process.platform === 'win32' && 'emulates a Linux host with real folders' }, async t => {
  const { h, dir } = await contentHarness(t), fsp = require('node:fs/promises');
  for (const call of [['xenia:content-folder', 'choose'], ['admin:settings']]) await assert.rejects(h.invoke(...call), /session expired/);
  await assert.rejects(h.untrusted('xenia:content-folder', 'choose'), /Untrusted/);
  await h.invoke('admin:unlock', '1234', 'xenia');
  assert.equal((await h.invoke('admin:settings')).content_root, path.join(dir, 'content'), 'Xenia\'s default');
  await assert.rejects(h.invoke('xenia:content-folder', 'elsewhere'), /Invalid action/);
  const chosen = path.join(dir, 'my content'); await fsp.mkdir(chosen);
  h.setResult({ canceled: false, filePaths: [chosen] });
  assert.equal((await h.invoke('xenia:content-folder', 'choose')).content_root, chosen);
  assert.match(await fsp.readFile(path.join(dir, 'xenia-edge.config.toml'), 'utf8'), /content_root = ".*my content"/);
  h.setResult({ canceled: true, filePaths: [] });
  assert.equal((await h.invoke('xenia:content-folder', 'choose')).content_root, chosen, 'cancelling changes nothing');
  assert.equal((await h.invoke('xenia:content-folder', 'default')).content_root, path.join(dir, 'content'));
});
test('the view (skin) is changed from the Dashboard section; only views that exist are accepted', async () => {
  const h = await mainHarness();
  assert.equal((await h.invoke('theme:get')).skin, 'nxe');
  await assert.rejects(h.invoke('admin:skin', 'blades'), /session expired/);
  await assert.rejects(h.untrusted('admin:skin', 'blades'), /Untrusted/);
  await h.invoke('admin:unlock', '1234', 'xenia');
  await assert.rejects(h.invoke('admin:skin', 'blades'), /session expired/, 'a Xenia session is not enough');
  await h.invoke('admin:lock'); await h.invoke('admin:unlock', '1234', 'dashboard');
  for (const bad of ['', 'Blades', '../x', 'a b', 7, null]) await assert.rejects(h.invoke('admin:skin', bad), /Invalid view/, String(bad));
  const nxeBackgrounds = (await h.invoke('theme:get')).backgrounds.length; assert.ok(nxeBackgrounds > 0);
  await assert.rejects(h.invoke('admin:skin', 'metro'), /Invalid view/, 'a look that does not exist');
  const metro = await h.invoke('admin:skin', 'metro-v1');
  assert.equal(metro.skin, 'metro-v1'); assert.deepEqual([...metro.backgrounds], [], 'Metro brings no wallpapers');
  assert.equal((await h.invoke('theme:get')).skin, 'metro-v1');
  // Blades borrows the NXE pack's sounds and glyphs, never its wallpapers, and shares its volume.
  const blades = await h.invoke('admin:skin', 'blades');
  assert.equal(blades.skin, 'blades'); assert.deepEqual([...blades.backgrounds], [], 'no wallpapers on blades');
  assert.equal((await h.invoke('admin:sound', 'volume', .25)).audio.volume, .25);
  const back = await h.invoke('admin:skin', 'nxe');
  assert.equal(back.skin, 'nxe'); assert.equal(back.backgrounds.length, nxeBackgrounds, 'the first look kept its own theme pack');
});

test('the install wizard: a first run is detected, opens a limited session without the PIN, and ends it', async () => {
  const h = await mainHarness(false, 'none', {}, { executable: '' });
  assert.equal((await h.invoke('wizard:state')).first_run, true);
  assert.equal((await h.invoke('admin:access', 'xenia')).pin_required, true, 'before it begins, the PIN is asked');
  await assert.rejects(h.untrusted('wizard:begin'), /Untrusted/);
  assert.deepEqual({ ...(await h.invoke('wizard:begin')) }, { session: true });
  assert.deepEqual({ ...(await h.invoke('wizard:begin')) }, { session: true }, 'asking twice is harmless');
  for (const section of ['xenia', 'dashboard']) assert.equal((await h.invoke('admin:access', section)).pin_required, false, section);
  assert.equal((await h.invoke('admin:access')).pin_required, true, 'the all-access scope still needs the PIN');
  assert.ok(await h.invoke('admin:settings'), 'the Folders screen opens without a PIN');
  assert.equal((await h.invoke('admin:skin', 'blades')).skin, 'blades', 'the first step saves the chosen view');
  assert.equal((await h.invoke('wizard:state')).first_run, false, 'a library with a view is no longer a first run');
  assert.ok(await h.invoke('admin:settings'), 'the session outlives that: it ends only with the wizard');
  assert.equal(await h.invoke('wizard:end'), true);
  await assert.rejects(h.invoke('admin:settings'), /session expired/, 'the wizard session is gone');
  assert.equal((await h.invoke('admin:access', 'xenia')).pin_required, true);
  await assert.rejects(h.invoke('wizard:begin'), /session expired/, 'a finished install cannot reopen the session');
});

test('an install that is already configured never starts the wizard by itself, and re-running it needs the Dashboard session', async () => {
  const h = await mainHarness();
  assert.equal((await h.invoke('wizard:state')).first_run, false);
  await assert.rejects(h.invoke('wizard:begin'), /session expired/, 'a locked, configured install cannot open the session');
  await h.invoke('admin:unlock', '1234', 'dashboard');
  assert.deepEqual({ ...(await h.invoke('wizard:begin')) }, { session: false }, 're-running from Dashboard Settings opens no extra session');
  assert.equal((await h.invoke('admin:access', 'xenia')).pin_required, true, 'and the PIN is still asked for Xenia');
  assert.equal(await h.invoke('wizard:end'), true);
});

test('choosing an unknown view is refused with a message that says view', async () => {
  const h = await mainHarness();
  await h.invoke('admin:unlock', '1234', 'dashboard');
  await assert.rejects(h.invoke('admin:skin', 'metro'), /Invalid view/);
});

test('the automatic cover download defaults to LaunchBox until another source is chosen', async () => {
  const h = await mainHarness();
  assert.equal((await h.invoke('library:get')).auto_cover_source, 'launchbox');
});

test('a new install asks for no PIN; turning the PIN on needs a PIN of your own first', async () => {
  const h = await mainHarness(false, 'none', {}, { library: { admin_pin_required: false, pin_is_default: true } });
  for (const section of ['xenia', 'dashboard']) assert.equal((await h.invoke('admin:access', section)).pin_required, false, `${section} opens without a PIN`);
  await h.invoke('admin:unlock', '', 'dashboard');
  await assert.rejects(h.invoke('admin:pin-protection', true), /Set a PIN first/);
  assert.equal((await h.invoke('admin:security')).admin_pin_required, false, 'still off after the refusal');
  await h.invoke('admin:set-pin', '4321');
  assert.deepEqual({ ...(await h.invoke('admin:pin-protection', true)) }, { pin_required: true });
  assert.equal((await h.invoke('admin:access', 'xenia')).pin_required, true, 'now it is asked');
  await h.invoke('admin:lock');
  await assert.rejects(h.invoke('admin:unlock', '1234', 'xenia'), /Incorrect PIN/, 'the placeholder PIN is gone');
  await h.invoke('admin:unlock', '4321', 'xenia');
});

test('an existing install that never chose keeps asking for its PIN', async () => {
  const h = await mainHarness();
  assert.equal((await h.invoke('admin:access', 'xenia')).pin_required, true);
});
