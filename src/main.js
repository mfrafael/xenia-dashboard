'use strict';
const { app, BrowserWindow, ipcMain, globalShortcut, protocol, net, dialog, nativeImage, shell } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const crypto=require('node:crypto');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const scanner = require('./scanner');
const covers = require('./covers');
const nxe = require('./nxe');
const {selectUserData,migrateUserData,portableUserData,defaultInstallsRoot,insideFolder,relocate,moveFolder}=require('./storage');
const {musicResponse}=require('./music-stream');
const {prepareHandoff}=require('./handoff');
const {groupGames}=require('./multidisc');
const {readAsset,appFile}=require('./local-assets');
const wizardState=require('./wizard-state');
const {watchTitleExit,terminateXenia}=require('./title-exit');
const updateNotice=require('./update-notice');
const updatePolicy=require('./update-policy');
const selfUpdate=require('./self-update');
const xeniaConfig=require('./xenia-config');
const xeniaSettings=require('./xenia-settings');
const xeniaPatches=require('./xenia-patches');
const gameInfo=require('./game-info');
const profiles=require('./profiles');
const xeniaReleases=require('./xenia-releases');
const optimizedSettings=require('./optimized-settings');
const contentInstaller=require('./content-installer');
const localCover=require('./local-cover');
const coverSourcesModule=require('./cover-sources');
const nativeGames=require('./native-games');
const runners=require('./runners');
const {existsSync,constants:fsConstants}=require('node:fs');
const ROOT=path.join(__dirname,'..'); // the app folder: index.html, assets/, skins/ ... are served from here
const RENDERER_URL='nxe-app://dashboard/index.html';
const unsafeSwitch=['no-sandbox','disable-web-security','ignore-certificate-errors','allow-running-insecure-content'].find(flag=>app.commandLine.hasSwitch?.(flag));
for(const flag of ['remote-debugging-port','remote-debugging-pipe'])app.commandLine.removeSwitch?.(flag);
app.setName('Xenia Dashboard');
const portableData=portableUserData();
if(!portableData)migrateUserData(app.getPath('appData'));
app.setPath('userData',portableData||selectUserData(app.getPath('appData'),app.getPath('userData'),app.isPackaged));
app.commandLine.appendSwitch('autoplay-policy','no-user-gesture-required');
let importedTheme=null;
let backgroundMusic;
let coverRevision=Date.now();
protocol.registerSchemesAsPrivileged([{scheme:'nxe-app',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true}}, { scheme: 'kratos-art', privileges: { standard: true, secure: true, supportFetchAPI: true,stream:true } }]);
let win, library, libraryFile, child,launchPending=false, allowQuit = false, attempts = 0, blockedUntil = 0;
let queue = Promise.resolve();
let pickerOpen = false, shortcutNoticeShown = false;
function serialized(work) { const result = queue.then(work); queue = result.catch(() => {}); return result; }
async function saveCover(id,bytes,extension='jpg'){
  const directory=path.join(app.getPath('userData'),'covers');await fs.mkdir(directory,{recursive:true});
  const file=covers.coverPath(directory,id,extension),temp=`${file}.${crypto.randomBytes(8).toString('hex')}.tmp`;
  let created=false;
  try{await fs.writeFile(temp,bytes,{mode:0o600,flag:'wx'});created=true;await fs.rename(temp,file);created=false;}
  finally{if(created)await fs.unlink(temp).catch(()=>{});}
  await fs.unlink(covers.coverPath(directory,id,extension==='png'?'jpg':'png')).catch(()=>{});   // the other kind of the same cover
  return file;
}
// Xenia's files live next to the executable (portable.txt) or in the user's Xenia folder.
// Wine/Proton builds keep theirs inside the prefix, which NXE only reaches in portable mode.
function xeniaLocation(){
  const executable=library.xenia_executable;
  if(!executable)throw Error('Install or choose a Xenia in Xenia Settings › Updates first.');
  const wine=process.platform==='linux'&&library.runner!=='native'&&/\.exe$/i.test(executable);
  const location=xeniaConfig.locate({executable,platform:process.platform,home:app.getPath('home'),documents:app.getPath('documents'),xdgDataHome:process.env?.XDG_DATA_HOME,existing:existsSync});
  if(!location||(wine&&location.storage!==path.dirname(executable)))throw Error('Xenia settings run inside Wine here. Put an empty portable.txt next to the Xenia executable so NXE can reach them.');
  return location;
}
function xeniaGame(id){
  if(id===null||id===undefined)return null;
  const game=library.games.find(g=>g.id===id);
  if(!game)throw Error('Unknown game');
  if(!game.title_id)throw Error('This game has no title ID, so Xenia cannot match per-game settings to it.');
  return {id:game.id,title:groupGames(library.games).find(g=>g.id===id)?.title||game.title,title_id:game.title_id};
}
async function xeniaContentRoot(location,globalText){
  let root='';
  try{root=xeniaConfig.get(xeniaConfig.parse(globalText ?? await xeniaConfig.read(location.file)),'Storage','content_root')?.value || '';}catch{/* Default content folder. */}
  return root&&path.isAbsolute(root)?root:path.join(location.storage,'content');
}
async function xeniaProfiles(location,globalText){try{return await profiles.list(await xeniaContentRoot(location,globalText));}catch{return [];}}
async function xeniaFiles(gameId){
  const location=xeniaLocation(),game=xeniaGame(gameId);
  let global;
  try{global=await xeniaConfig.read(location.file);}
  catch(error){if(error.code==='ENOENT')throw Error(`Xenia has not created ${path.basename(location.file)} yet. Start any game once, then come back.`);throw error;}
  const gameFile=game?path.join(location.storage,'config',`${game.title_id}.config.toml`):null;
  return {location,game,global,gameFile,override:gameFile?await xeniaConfig.readOptional(gameFile):'',profiles:await xeniaProfiles(location,global)};
}
function xeniaView(files){return {...xeniaSettings.payload(files.global,files.override,{platform:process.platform,game:files.game,profiles:files.profiles}),file:files.game?files.gameFile:files.location.file,flavor:files.location.flavor};}
async function patchView(gameId){
  const location=xeniaLocation(),game=xeniaGame(gameId);if(!game)throw Error('Choose a game first');
  const result=await xeniaPatches.list(location.storage,game.title_id);let applyPatches=null;
  try{applyPatches=xeniaConfig.get(xeniaConfig.parse(await xeniaConfig.read(location.file)),'General','apply_patches')?.value ?? null;}catch{/* Missing config: Xenia's default applies. */}
  return {...result,game,apply_patches:applyPatches};
}
const defaultInstalls=()=>defaultInstallsRoot({userData:app.getPath('userData'),home:app.getPath('home'),platform:process.platform,portable:!!portableData});
const installsRoot=()=>library?.xenia_install_dir||defaultInstalls();
// Moves the installed builds to a new place (the folder holding them is always called "xenia") and keeps the Xenia the
// dashboard launches pointing at the same copy. A destination that already holds builds is simply switched to.
async function moveInstalls(target){
  const from=installsRoot(),to=target||defaultInstalls();
  if(path.resolve(from)===path.resolve(to))return;
  if(insideFolder(to,from)||insideFolder(from,to))throw Error('Choose a folder outside the current Xenia folder.');
  const occupied=await fs.readdir(to).then(list=>list.length>0,()=>false);
  if(!occupied&&existsSync(from))await moveFolder(from,to);
  const next={...library,xenia_executable:occupied?library.xenia_executable:relocate(library.xenia_executable,from,to)};
  if(target)next.xenia_install_dir=to;else delete next.xenia_install_dir;
  await scanner.saveLibrary(libraryFile,next);library=next;
}
function updatesPlatform(channel){
  if(typeof channel!=='string'||!Object.hasOwn(xeniaReleases.CHANNELS,channel))throw Error('Unknown Xenia channel');
  const platform=process.platform==='win32'?'win32':process.platform==='linux'?'linux':null;
  if(!platform||!xeniaReleases.supports(channel,platform))throw Error(`${xeniaReleases.CHANNELS[channel].label} has no build for this system`);
  return platform;
}
async function updatesStatus(){
  const platform=process.platform==='win32'?'win32':process.platform==='linux'?'linux':null,channels=[];
  for(const [id,info] of Object.entries(xeniaReleases.CHANNELS)){
    const supported=!!platform&&xeniaReleases.supports(id,platform);
    const state=supported?await xeniaReleases.readState(installsRoot(),id):{current:null,previous:null};
    const executable=supported?xeniaReleases.executablePath(installsRoot(),id,platform):null;
    channels.push({id,label:info.label,supported,installed:state.current,previous:state.previous,executable,in_use:!!executable&&!!library.xenia_executable&&path.resolve(library.xenia_executable)===path.resolve(executable)});
  }
  // Xenia writes its settings file the first time it runs; until then the dashboard cannot read or change them.
  let config_ready=false;try{config_ready=!!library.xenia_executable&&existsSync(xeniaLocation().file);}catch{/* no readable location yet */}
  return {platform,configured:library.xenia_executable||'',config_ready,channels,install_root:installsRoot(),install_is_default:!library.xenia_install_dir};
}
// DLC and title updates found next to the ROMs. The screen can only ask to install a path that is in this list
// and belongs to the chosen game; the destination is then worked out from the package's own header.
let foundPackages=[];
async function contentView(gameId){
  const files=await xeniaFiles(gameId),root=await xeniaContentRoot(files.location,files.global);
  foundPackages=await scanner.scanPackagesIn(scanner.romFolders(library));
  const have=await contentInstaller.listInstalled(root,files.game.title_id),names=new Set(have.map(item=>`${item.kind}/${item.name}`));
  const available=foundPackages.filter(item=>item.title_id===files.game.title_id).map(item=>{const what=contentInstaller.kind(item.content_type);return {path:item.path,name:path.basename(item.path),display_name:item.display_name,kind:what.id,label:what.label,size:item.size,installed:names.has(`${what.id}/${path.basename(item.path)}`)};});
  return {game:files.game,available,installed:have};
}
let optimizedIndex=null;
async function optimizedView(files){
  const fetcher=(...args)=>net.fetch(...args);
  const found=await optimizedSettings.fetchSettings(files.game.title_id,fetcher);
  if(!found)return {available:false,game:files.game};
  optimizedIndex??=await optimizedSettings.fetchIndex(fetcher);
  return {available:true,game:files.game,title:found.title,modified:optimizedIndex.get(files.game.title_id)||'',...optimizedSettings.plan(files.global,files.override,found.text)};
}
async function useInstalled(channel,platform){
  const executable=xeniaReleases.executablePath(installsRoot(),channel,platform);
  await fs.access(executable);
  const next={...library,xenia_executable:executable};await scanner.saveLibrary(libraryFile,next);library=next;
}
function requireIdle(){if(child||launchPending)throw Error('Close the running game before changing Xenia settings.');}
const ANIMATION_MODES=['on','system','off'];
// A skin brings its own theme pack (backgrounds, icons, sounds). This file only knows the provider contract:
// where the choice is saved (key), how to load the pack, how to describe it to the screen and how to save a choice.
// Blades draws with its own files (skins/blades/assets: blades, swirl, sounds, font). From the NXE pack it only keeps the
// saved volume (same saved choice, so the volume is shared), never its wallpapers or sounds.
const BLADES_SOUNDS={slide1:'bladeslide-1',slide2:'bladeslide-2',slide3:'bladeslide-3',slide4:'bladeslide-4',focus:'cursor',notify:'notification',left:'cursor',right:'cursor',select:'select',back:'back',open:'tier2-enter',close:'tier2-exit'};
const bladesView=theme=>({...nxe.publicTheme(theme),backgrounds:[],selected:null,scene:{},menu:null,icons:{},buttons:{},
  sounds:Object.fromEntries(Object.entries(BLADES_SOUNDS).map(([role,file])=>[role,`nxe-app://dashboard/skins/blades/assets/${file}.wav`]))});
// Kinect draws with its own files too (skins/kinect/assets, from dashboard 2.0.13604): sounds, the A/B/X/Y legends.
const KINECT_SOUNDS={notify:'notification',slide:'channel',focus:'focus',left:'left',right:'right',select:'select',back:'back',open:'open',close:'close'};
const kinectView=theme=>({...nxe.publicTheme(theme),backgrounds:[],selected:null,scene:{},menu:null,icons:{},
  buttons:Object.fromEntries(['A','B','X','Y'].map(key=>[key,`nxe-app://dashboard/skins/kinect/assets/button-${key.toLowerCase()}.png`])),
  sounds:Object.fromEntries(Object.entries(KINECT_SOUNDS).map(([role,file])=>[role,`nxe-app://dashboard/skins/kinect/assets/${file}.wav`]))});
// Metro shares the Kinect dashboard's sounds (the same files in 2.0.15574) and has its own A/B/X/Y legends.
const metroView=theme=>({...kinectView(theme),buttons:Object.fromEntries(['A','B','X','Y'].map(key=>[key,`nxe-app://dashboard/skins/metro-v1/assets/button-${key.toLowerCase()}.png`]))});
// NXE draws with its pack and adds the dashboard's channel-change sound (skins/nxe/assets/channel.wav).
const nxeView=theme=>{const view=nxe.publicTheme(theme);return {...view,sounds:{...view.sounds,slide:'nxe-app://dashboard/skins/nxe/assets/channel.wav',notify:'nxe-app://dashboard/skins/nxe/assets/notification.wav'}};};
const THEME_PROVIDERS={
  nxe:{key:'nxe_theme',load:(config,userData)=>nxe.loadTheme(config,userData),view:nxeView,config:nxe.themeConfig},
  blades:{key:'nxe_theme',load:(config,userData)=>nxe.loadTheme(config,userData),view:bladesView,config:nxe.themeConfig},
  kinect:{key:'nxe_theme',load:(config,userData)=>nxe.loadTheme(config,userData),view:kinectView,config:nxe.themeConfig},
  'metro-v1':{key:'nxe_theme',load:(config,userData)=>nxe.loadTheme(config,userData),view:metroView,config:nxe.themeConfig}
};
// A saved view that no longer exists falls back to NXE.
const skinName=()=>Object.hasOwn(THEME_PROVIDERS,library?.skin||'')?library.skin:'nxe';
const themeProvider=()=>THEME_PROVIDERS[skinName()]||null;
async function loadSkinTheme(){
  const provider=themeProvider(),userData=app.getPath('userData');
  if(!provider)return null;
  try{return await provider.load(library[provider.key],userData);}
  catch(error){console.warn(`[Xenia Dashboard] Theme fallback: ${error.message}`);return provider.load(null,userData).catch(()=>null);}
}
// Music and sound effects are two switches of the app itself (saved in the library, not in a theme pack), so they work with
// every view. A library saved before they existed keeps what its old single "muted" said.
const soundState=view=>{const legacy=view.audio?.muted===true;return {music:typeof library?.music_enabled==='boolean'?library.music_enabled:!legacy,effects:typeof library?.effects_enabled==='boolean'?library.effects_enabled:!legacy};};
// The boot animation: 'theme' (the one of the view in use, the default), 'off', or the name of a view whose video is always played.
const bootChoice=()=>{const value=library?.boot_animation;return value===false||value==='off'?'off':typeof value==='string'&&/^[a-z][a-z0-9-]{0,30}$/.test(value)&&value!=='theme'?value:'theme';};
// How long a notification stays on screen (seconds); 0 means notifications are off. Five unless the user chose otherwise.
const noticeSeconds=()=>{const value=library?.notice_seconds;return typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=5&&Number.isInteger(value*2)?value:5;};
// Fullscreen (the console way, kiosk) or a normal, resizable window. The window always has its frame (a fullscreen window
// hides it), so the two modes switch live, with no restart. A windowed window comes back at the size and place it was left.
const windowMode=()=>library?.window_mode==='windowed'?'windowed':'fullscreen';
const themeState=theme=>{const view=(themeProvider()?.view||nxe.publicTheme)(theme);return {...view,audio:{...view.audio,volume:typeof library?.volume==='number'?library.volume:view.audio?.volume??.5},skin:skinName(),animations:ANIMATION_MODES.includes(library?.animations)?library.animations:'on',boot_animation:bootChoice(),notice_seconds:noticeSeconds(),window_mode:windowMode(),sound:soundState(view)};};
// Admin sessions are scoped: '*' (Admin button / Start) covers everything, 'xenia' and 'dashboard'
// (a section's own tiles) cover only that section's IPC. Each lasts five minutes.
const SECTION_IDS=['xenia','dashboard'];
const adminSessions=new Map();
// A first-run wizard holds a restricted session (xenia and dashboard scopes only) until wizard:end.
let wizardSession=false;
const sessionValid=key=>Date.now() <= (adminSessions.get(key) ?? 0) || (wizardSession && SECTION_IDS.includes(key));
const adminActive=()=>[...adminSessions.keys()].some(sessionValid);
function lockedSections(){return Array.isArray(library.locked_sections)?SECTION_IDS.filter(id=>library.locked_sections.includes(id)):[...SECTION_IDS];}
function checkSection(section){if(section===undefined||section===null)return '*';if(!SECTION_IDS.includes(section))throw Error('Unknown section');return section;}
function pinRequiredFor(scope){if(wizardSession&&SECTION_IDS.includes(scope))return false;return library.admin_pin_required!==false&&(scope==='*'||lockedSections().includes(scope));}
function requireAdmin(section) { if (!(sessionValid('*') || (section && sessionValid(section)))) throw new Error('Admin session expired. Open administrator access again.'); }
// Hidden games are one list of ids in the library (hidden_game_ids) and nothing else says so: a rescan, a cover change or a re-read
// of the folders can never bring a hidden game back, or hide a shown one. A multi-disc game is hidden when all its discs are.
const hiddenGameIds=()=>new Set(Array.isArray(library.hidden_game_ids)?library.hidden_game_ids.filter(id=>typeof id==='string'):[]);
const isHidden=(game,ids)=>game.discs?game.discs.every(disc=>ids.has(disc.id)):ids.has(game.id);
function publicGameList(games,hidden=false) { const ids=hiddenGameIds(); return groupGames(games).filter(g=>isHidden(g,ids)===hidden).map(g=>{
  const art=g.discs?.find(d=>d.cover_art_path)||g;
  const cover=art.cover_art_path?`kratos-art://cover/${art.id}?v=${coverRevision}`:null;
  return {id:g.id,kind:g.kind==='native'?'native':'xenia',title:g.title,...(g.title_id?{title_id:g.title_id}:{}),...(hidden?{hidden:true}:{}),uses_fallback_art:!cover,cover_art_path:cover,
    ...(g.discs?{discs:g.discs.map(d=>({id:d.id,number:d.disc_number,title:`Disc ${d.disc_number}`,uses_fallback_art:!cover,cover_art_path:cover}))}:{})};
}); }
function publicGames() { return publicGameList(library.games); }
function publicHiddenGames() { return publicGameList(library.games,true); }
const validBounds=b=>b&&['x','y','width','height'].every(k=>Number.isInteger(b[k]))&&b.width>=960&&b.height>=540&&b.width<=16384&&b.height<=16384;
const windowedBounds=()=>validBounds(library?.window_bounds)?library.window_bounds:{width:1280,height:720};
async function setWindowMode(mode){
  if(mode===windowMode()&&win&&!win.isDestroyed())return;
  if(mode==='windowed'){} else if(win&&!win.isDestroyed()&&windowMode()==='windowed'&&!win.isFullScreen())library={...library,window_bounds:win.getBounds()};
  library={...library,window_mode:mode};await scanner.saveLibrary(libraryFile,library);
  if(!win||win.isDestroyed())return;
  if(mode==='fullscreen'){win.setKiosk(true);win.setFullScreen(true);shortcuts();}
  else{
    win.setKiosk(false);win.setFullScreen(false);globalShortcut.unregister('Alt+Tab');
    const bounds=windowedBounds();win.setBounds(bounds);if(!('x' in bounds))win.center();
  }
  win.focus();win.webContents.send('window:mode',mode);
}
function shortcuts() {
  // Close, devtools and fullscreen shortcuts are blocked locally by the window.
  // Windows reserves task switching and the Windows key; Super alone is not an accelerator.
  if (windowMode() === 'fullscreen' && process.platform === 'linux' && !globalShortcut.isRegistered('Alt+Tab')) {
    try { globalShortcut.register('Alt+Tab', () => {}); } catch { /* Desktop may reserve it. */ }
  }
  if (!shortcutNoticeShown) {
    console.info('[Xenia Dashboard] Kiosk active. OS task switching requires desktop/account restrictions.');
    shortcutNoticeShown = true;
  }
}
// Notifications for the screen (a new Xenia build…). They wait here until the screen asks for them; after that they go straight out.
const notices = []; let noticesReady = false;
function pushNotice(notice) {
  if (noticesReady && win && !win.isDestroyed()) win.webContents.send('notice', notice); else notices.push(notice);
}
// The Xenia the dashboard installed and is launching (what Xenia Settings › Updates calls "in use"); null for a Xenia of the user's own.
const managedXenia=status=>status.channels.find(channel=>channel.in_use&&channel.installed?.tag)||null;
// Is the Xenia in use out of date? → {channel,label,installed,latest (null: up to date or unknown),managed,found} for the managed
// copy or an own copy recognised as an official build, otherwise null. Offline or anything unexpected only leaves `latest` empty.
async function checkXeniaUpdate() {
  const platform = process.platform === 'win32' ? 'win32' : process.platform === 'linux' ? 'linux' : null;
  if (!platform || !library?.xenia_executable) return null;
  const status = await updatesStatus(), used = managedXenia(status);
  const request = (url, limit) => covers.request(url, (...args) => net.fetch(...args), limit);
  let found = null;
  try {
    found = await updateNotice.findUpdate({
      status, configured: library.xenia_executable, platform, supports: xeniaReleases.supports,
      latest: id => xeniaReleases.latest(id, platform, request),
      identify: (id, release) => xeniaReleases.identify(library.xenia_executable, id, platform, request, release)
    });
  } catch (error) { console.warn('[Xenia Dashboard] Update check:', error.message); }
  if (used) return { channel: used.id, label: used.label, installed: used.installed.tag, latest: found?.latest ?? null, managed: true, found };
  return found && { channel: found.channel, label: found.label, installed: found.installed, latest: found.latest, managed: false, found };
}
// Downloads, verifies and installs the latest build of one channel; the build it replaces is kept to go back to. `allowed` runs again
// once the release is known, to re-check what let the caller start (a PIN session, no game running). Returns the release installed.
// While it runs no game may start (launch() checks xeniaInstalling), so the build is never swapped under a running Xenia.
let xeniaInstalling=false;
async function installXenia(channel,allowed){
  requireIdle();const platform=updatesPlatform(channel);
  xeniaInstalling=true;
  try{
    const release=await xeniaReleases.latest(channel,platform,(url,limit)=>covers.request(url,(...args)=>net.fetch(...args),limit));
    allowed();
    await xeniaReleases.downloadAndInstall(installsRoot(),channel,platform,release,{fetcher:xeniaReleases.httpsFetcher,onProgress:progress=>{if(win&&!win.isDestroyed())win.webContents.send('updates:progress',progress);}});
    // Nothing configured yet (a first run): use what was just installed. Otherwise the user decides.
    if(!library.xenia_executable)await useInstalled(channel,platform);
    return release;
  }finally{xeniaInstalling=false;}
}
// ---- Updates (Dashboard Settings › Updates): the dashboard's own and Xenia's, each 'notify' (the default) or 'auto'. Checked once
// per start, a few seconds after the window loaded; offline or GitHub failing says nothing. Only 'auto' installs anything by itself.
const RELEASE_PAGE='https://github.com/mfrafael/xenia-dashboard/releases/latest';
const STARTUP_CHECK_DELAY=5000;
const INSTALL_QUIT_GRACE=10000;   // how long "Update to…" leaves the app closable for the installer
const updateModes=()=>({dashboard:updatePolicy.normalizeMode(library?.update_mode_dashboard),xenia:updatePolicy.normalizeMode(library?.update_mode_xenia)});
const gameRunning=()=>!!(child||launchPending);
let installKindFound=null,selfUpdater=null,dashboardLatest=null,dashboardDownloaded=false,dashboardDownload=null,xeniaUpdate=null,startupChecked=false;
// How this copy was installed decides whether it can replace itself; an AppImage also needs a folder it may write to.
function dashboardKind(){
  return installKindFound??=(async()=>{
    const env=process.env||{};let appImageWritable=false;
    if(app.isPackaged&&process.platform==='linux'&&env.APPIMAGE)appImageWritable=await fs.access(path.dirname(env.APPIMAGE),fsConstants.W_OK).then(()=>true,()=>false);
    return updatePolicy.installKind({packaged:app.isPackaged===true,platform:process.platform,env,appImageWritable});
  })();
}
// Made on first use and never for a source install, so electron-updater is only loaded when a packaged copy checks.
const dashboardUpdater=()=>selfUpdater??=selfUpdate.createSelfUpdater({loadUpdater:()=>require('electron-updater').autoUpdater,log:message=>console.warn('[Xenia Dashboard] Update:',message)});
const sendAppProgress=percent=>{if(Number.isFinite(percent)&&win&&!win.isDestroyed())win.webContents.send('app-update:progress',percent);};
// One download at a time; a failed one can be tried again.
function downloadDashboard(){
  return dashboardDownload??=dashboardUpdater().download(sendAppProgress).then(ok=>ok===true,()=>false).then(ok=>{dashboardDownloaded=ok;if(!ok)dashboardDownload=null;return ok;});
}
async function appUpdateState(){
  return {modes:updateModes(),dashboard:{kind:await dashboardKind(),current:app.getVersion(),latest:dashboardLatest,downloaded:dashboardDownloaded},
    xenia:xeniaUpdate&&{channel:xeniaUpdate.channel,label:xeniaUpdate.label,installed:xeniaUpdate.installed,latest:xeniaUpdate.latest,managed:xeniaUpdate.managed}};
}
const xeniaUpdatedNotice=(channel,label,tag)=>({id:`xenia-updated:${channel}:${tag}`,title:'Xenia updated',text:`${label} updated to ${tag}`});
// What ran, so the next start can tell that an update happened. Not serialized: callers already are, or wrap it.
async function saveRun(fields){
  const next={...library,...fields};if(!next.last_run_xenia)delete next.last_run_xenia;
  await scanner.saveLibrary(libraryFile,next);library=next;
}
const xeniaRunning=status=>{const used=managedXenia(status);return used?{channel:used.id,tag:used.installed.tag}:null;};
// After the user's own change of the Xenia in use (install, Use it, Go back to…, own copy): remembered, so it is not announced as an update.
const rememberXenia=async()=>saveRun({last_run_xenia:xeniaRunning(await updatesStatus())});
// The first start after an update says so, once. An unreadable Xenia status keeps what was remembered and announces nothing for Xenia.
async function announceUpdates(){
  const dashboard=updatePolicy.updatedNotice({lastRun:library.last_run_version,current:app.getVersion()});
  if(dashboard)pushNotice({id:`dashboard-updated:${dashboard.to}`,title:'Dashboard updated',text:`Dashboard updated to ${dashboard.to}`});
  let status=null;try{status=await updatesStatus();}catch(error){console.warn('[Xenia Dashboard] Update notice:',error.message);}
  const now=status?xeniaRunning(status):library.last_run_xenia,label=status&&managedXenia(status)?.label;
  const xenia=status&&updatePolicy.xeniaUpdatedNotice({last:library.last_run_xenia,now});
  if(xenia)pushNotice(xeniaUpdatedNotice(xenia.channel,label,xenia.to));
  await serialized(()=>saveRun({last_run_version:app.getVersion(),last_run_xenia:now}));
}
// `act` (only at start) puts up the notices and does what Automatic allows; a check from the menu only refreshes the state.
async function checkDashboardUpdate(act){
  const kind=await dashboardKind();
  if(kind==='source')return;
  let latest=null;
  try{latest=(await dashboardUpdater().check())?.version||null;}catch(error){console.warn('[Xenia Dashboard] Update check:',error.message);}
  const action=updatePolicy.dashboardAction({kind,mode:updateModes().dashboard,current:app.getVersion(),latest});
  dashboardLatest=action==='none'?null:latest;
  if(!act)return;
  if(action==='notify'||action==='open-page')pushNotice({id:`dashboard-update:${latest}`,title:'Dashboard update available',text:`Dashboard ${latest} available · Dashboard Settings › Updates`});
  // Automatic: download now, install when the user closes the app (see before-quit), never in the middle of use.
  if(action==='auto-download'&&await downloadDashboard())dashboardUpdater().installOnQuit(true);
}
async function checkXenia(act){
  const xenia=await checkXeniaUpdate().catch(error=>{console.warn('[Xenia Dashboard] Update check:',error.message);return null;});
  xeniaUpdate=xenia;
  if(!act||!xenia?.found)return;
  const action=updatePolicy.xeniaAction({found:xenia.found,managed:xenia.managed,mode:updateModes().xenia,gameRunning:gameRunning()});
  if(action==='notify')pushNotice(updateNotice.noticeFor(xenia.found));
  if(action!=='auto-install')return;
  try{
    const release=await serialized(async()=>{
      if(managedXenia(await updatesStatus())?.id!==xenia.channel)return null;   // the user switched to another Xenia meanwhile
      const installed=await installXenia(xenia.channel,requireIdle);
      await saveRun({last_run_xenia:{channel:xenia.channel,tag:installed.tag}});   // announced now, so not again next start
      return installed;
    });
    if(!release)return;
    xeniaUpdate={...xenia,installed:release.tag,latest:null};
    pushNotice(xeniaUpdatedNotice(xenia.channel,xenia.label,release.tag));
  }catch(error){
    console.warn('[Xenia Dashboard] Xenia update:',error.message);
    if(gameRunning())pushNotice(updateNotice.noticeFor(xenia.found));   // a game started meanwhile: tell the user instead
  }
}
async function checkAppUpdates({act=false}={}){
  await Promise.all([checkDashboardUpdate(act),checkXenia(act)]);
  return appUpdateState();
}
// Once per start (the timer set after the window loaded), in the background. Nothing in here may reach the user as an error.
async function runStartupUpdateChecks(){
  if(startupChecked)return;startupChecked=true;
  try{await announceUpdates();}catch(error){console.warn('[Xenia Dashboard] Update notice:',error.message);}
  try{await checkAppUpdates({act:true});}catch(error){console.warn('[Xenia Dashboard] Update check:',error.message);}
}
function recover(state) {
  child = null;
  if (!win || win.isDestroyed()) return;
  win.restore(); win.show(); if (windowMode() === 'fullscreen') { win.setKiosk(true); win.setFullScreen(true); shortcuts(); } win.focus();
  win.webContents.send('game:state', state);
}
function handle(channel, fn) {
  ipcMain.handle(channel, async (event, ...args) => {
    if (!win || event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame || event.senderFrame.url !== RENDERER_URL) throw new Error('Untrusted caller');
    return fn(...args);
  });
}
const refuseWhileInstalling=()=>{if(xeniaInstalling)throw new Error('Xenia is being updated. Try again in a moment.');};
async function launch(id) {
  if (child||launchPending) throw new Error('A game is already running');
  refuseWhileInstalling();
  const game = library.games.find(g => g.id === id);
  if (!game) throw new Error('Unknown game');
  if (game.kind === 'native') return launchNative(game);
  await fs.access(game.rom_path); await fs.access(library.xenia_executable);
  // Re-check after asynchronous validation to prevent concurrent launches.
  if (child||launchPending) throw new Error('A game is already running');
  refuseWhileInstalling();
  launchPending=true;
  adminSessions.clear();
  // Native Linux builds (e.g. Xenia Edge AppImage) run directly; only Windows .exe files need Wine/Proton.
  const wrapped = process.platform === 'linux' && library.runner !== 'native' && /\.exe$/i.test(library.xenia_executable);
  const command = wrapped ? library.runner || 'wine' : library.xenia_executable;
  // Xenia writes its log where the dashboard can read it: that is how the dashboard knows the game went back to the dashboard.
  const sessionLog = path.join(app.getPath('userData'), 'xenia-session.log');
  const xeniaArgs = ['--fullscreen', `--log_file=${sessionLog}`, '--log_level=2', game.rom_path];
  const args = wrapped ? [...(library.runner_args || []), library.xenia_executable, ...xeniaArgs] : xeniaArgs;
  await fs.mkdir(path.dirname(sessionLog), { recursive: true }); await fs.writeFile(sessionLog, '');
  const handoff=prepareHandoff(win,{platform:process.platform});
  try{await handoff.ready;child = spawn(command, args, { shell: false, cwd: path.dirname(library.xenia_executable), stdio: 'ignore', windowsHide: false, detached: process.platform === 'linux' });}
  catch(error){handoff.cancel();throw error;}
  finally{launchPending=false;}
  let finished = false;
  const running = child;
  // "Return to Arcade" in the game: Xenia would stay open on its game list, so close it and come back to the dashboard.
  const exitWatch = watchTitleExit(sessionLog, () => terminateXenia(running));
  const finish = state => { if (!finished) { finished = true;exitWatch.stop();handoff.cancel(); recover(state); } };
  child.once('error', error => finish({ running: false, error: `Launch failed: ${error.message}` }));
  child.once('close', code => finish({ running: false, error: code ? `Emulator exited with code ${code}` : null }));
  child.once('spawn', () => {
    // Keep the dashboard fullscreen underneath Xenia during window creation.
    globalShortcut.unregisterAll();
    handoff.watch(child.pid);
    win.webContents.send('game:state', { running: true });
  });
  return true;
}
// A native game (recomp, PC port) runs by itself: no Xenia and no log to watch; the dashboard comes back when it exits.
async function launchNative(game) {
  const entry=nativeGames.entries(library).find(item=>nativeGames.gameId(item.path)===game.id);
  if(!entry)throw new Error('Unknown game');
  try{await fs.access(game.rom_path);}catch{throw new Error(`Game file not found: ${game.rom_path}`);}
  const linux=process.platform==='linux';
  let script=false;
  if(linux&&/\.sh$/i.test(game.rom_path)){try{const fh=await fs.open(game.rom_path,'r');try{const {bytesRead,buffer}=await fh.read(new Uint8Array(2),0,2,0);script=!(bytesRead===2&&buffer[0]===0x23&&buffer[1]===0x21);}finally{await fh.close();}}catch{/* unreadable: it fails when started, with the real reason */}}
  const run=nativeGames.launchCommand({script,file:game.rom_path,platform:process.platform,runner:entry.runner||library.runner,runnerArgs:Array.isArray(library.runner_args)?library.runner_args:[],userData:app.getPath('userData'),steamRoot:linux?await runners.steamRoot(app.getPath('home')):null,gameId:game.id});
  if(run.command!==game.rom_path&&path.isAbsolute(run.command)){try{await fs.access(run.command);}catch{throw new Error(`Runner not found: ${run.command}`);}}
  // A downloaded AppImage often lacks the executable bit; the user picked this file, so make it runnable for them.
  if(linux&&run.command===game.rom_path){
    const {mode}=await fs.stat(game.rom_path);
    if(!(mode&0o100))try{await fs.chmod(game.rom_path,mode|0o100);}catch(error){throw new Error(`Could not make ${game.rom_path} executable (${error.code||error.message}). Make it executable in your file manager, or move it to a drive that allows it.`);}
  }
  if(run.prefix)await fs.mkdir(run.prefix,{recursive:true});
  if(child||launchPending)throw new Error('A game is already running');
  refuseWhileInstalling();
  launchPending=true;
  adminSessions.clear();
  const handoff=prepareHandoff(win,{platform:process.platform});
  try{await handoff.ready;child=spawn(run.command,run.args,{shell:false,cwd:run.cwd,stdio:'ignore',windowsHide:false,detached:linux,...(run.verbatim?{windowsVerbatimArguments:true}:{}),...(run.env?{env:{...process.env,...run.env}}:{})});}
  catch(error){handoff.cancel();throw error;}
  finally{launchPending=false;}
  let finished=false;
  const finish=state=>{if(!finished){finished=true;handoff.cancel();recover(state);}};
  child.once('error',error=>finish({running:false,error:`Launch failed: ${error.message}`}));
  child.once('close',code=>finish({running:false,error:code?`Game exited with code ${code}`:null}));
  child.once('spawn',()=>{globalShortcut.unregisterAll();handoff.watch(child.pid);win.webContents.send('game:state',{running:true});});
  return true;
}
if(unsafeSwitch){console.error(`[Xenia Dashboard] Refusing unsafe startup option: --${unsafeSwitch}`);app.quit();}
else if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (win && !child) { win.restore(); win.focus(); } });
  app.whenReady().then(async () => {
    libraryFile = path.join(app.getPath('userData'), 'library.json');
    library = await scanner.loadLibrary(libraryFile);
    // The first native-games version kept bare paths in exe_games; they become named entries once.
    {const migrated=nativeGames.migrate(library);if(migrated!==library){library=migrated;await scanner.saveLibrary(libraryFile,library);}}
    // An install that already has settings never gets the wizard unasked; remember that so a later reset of one setting does not bring it back.
    if(!library.wizard_done&&!wizardState.isFirstRun(library))library={...library,wizard_done:true};
    importedTheme=await loadSkinTheme();
    const coverDirectory = path.join(app.getPath('userData'), 'covers');
    let scanError = '';
    // Games from every ROM folder; a folder that cannot be read is named in the message but does not hide the others.
    const byTitle=(a,b)=>a.title.localeCompare(b.title)||a.rom_path.localeCompare(b.rom_path);
    // The native games with their covers: a cover picked for one wins over the picture next to its file, which is only the fallback.
    const scanNative=async failed=>{
      const natives=await nativeGames.games(nativeGames.entries(library),process.platform,(file,error)=>failed.push(`${file} (${error.code||error.message})`));
      const sidecars=new Map(natives.map(game=>[game.id,game.cover_art_path]));
      for(const game of natives){game.cover_art_path=null;game.uses_fallback_art=true;}
      await covers.applyCached(natives,coverDirectory);
      for(const game of natives)if(game.uses_fallback_art&&sidecars.get(game.id)){game.cover_art_path=sidecars.get(game.id);game.uses_fallback_art=false;}
      return natives;
    };
    const scanFolders = async () => {
      const failed = [];
      const xenia=await covers.applyCached(await scanner.scanDirectories(scanner.romFolders(library),undefined,(folder,error)=>failed.push(`${folder} (${error.code||error.message})`)),coverDirectory);
      const games=[...xenia,...await scanNative(failed)].sort(byTitle);
      scanError = failed.length ? `Could not read: ${failed.join(', ')}` : '';
      return games;
    };
    try { library.games = await scanFolders(); await scanner.saveLibrary(libraryFile, library); } catch (error) { scanError = `Scan failed: ${error.message}`; }
    protocol.handle('nxe-app',async request=>{
      try{
        const url=new URL(request.url),file=url.pathname.slice(1);
        if(request.method!=='GET'||url.host!=='dashboard'||url.username||url.password||!appFile(file))return new Response('Not found',{status:404});
        const asset=await readAsset(path.join(ROOT,file),ROOT,['.html','.js','.css','.jpg','.png','.wav','.ttf','.webm'],32*1024*1024);
        // Videos and sounds are played by media elements, which ask for byte ranges: answer them like the other protocol does.
        return musicResponse(asset.bytes,request.headers.get('range'),asset.mime);
      }catch{return new Response('Not found',{status:404});}
    });
    protocol.handle('kratos-art', async request => {
      try{
      const url = new URL(request.url);
      if(!['GET','HEAD'].includes(request.method)||url.username||url.password||url.port)return new Response('Not found',{status:404});
      if(url.hostname==='music' && url.pathname==='/dashboard'){
        backgroundMusic ||= readAsset(path.join(ROOT,'assets','dashboard-music.ogg'),ROOT,['.ogg']);
        const asset=await backgroundMusic;return musicResponse(asset.bytes,request.headers.get('range'),asset.mime);
      }
      if(url.hostname==='preview'){
        const picture=previews.get(Number(url.pathname.slice(1)));
        return picture?new Response(picture.bytes,{headers:{'Content-Type':picture.mime,'X-Content-Type-Options':'nosniff','Cache-Control':'no-store'}}):new Response('Not found',{status:404});
      }
      if(url.hostname==='theme'){
        const id=url.pathname.slice(1),assets=importedTheme?.manifest.assets;
        if(!assets||!Object.hasOwn(assets,id))return new Response('Not found',{status:404});
        const asset=await readAsset(path.join(importedTheme.directory,assets[id].file),importedTheme.directory,['.jpg','.png','.wav']);
        return musicResponse(asset.bytes,request.headers.get('range'),asset.mime);
      }
      const game = library.games.find(g => g.id === url.pathname.slice(1));
      if (url.hostname !== 'cover' || !game?.cover_art_path) return new Response('Not found', { status: 404 });
      const root=covers.isCachedCover(game,coverDirectory)?app.getPath('userData'):path.dirname(game.rom_path);
      const asset=await readAsset(game.cover_art_path,root,['.jpg','.png','.jpeg']);
      return musicResponse(asset.bytes,request.headers.get('range'),asset.mime);
      }catch{return new Response('Not found',{status:404});}
    });
    handle('notices:take', () => { noticesReady = true; return notices.splice(0); });
    handle('library:get', () => ({ games: publicGames(), hidden_games: publicHiddenGames(), error: scanError, xenia_ready: !!library.xenia_executable, auto_cover_source: Object.hasOwn(coverSourcesModule.AUTO_MODES, library.auto_cover_source) ? library.auto_cover_source : 'launchbox' }));
    handle('game:launch', launch);
    handle('xenia:game-hidden',(gameId,hidden)=>serialized(async()=>{
      requireAdmin('xenia');
      if(typeof gameId!=='string'||typeof hidden!=='boolean')throw Error('Invalid hidden-game setting');
      const game=groupGames(library.games).find(item=>item.id===gameId);
      if(!game)throw Error('Unknown game');
      const ids=new Set(game.discs?game.discs.map(disc=>disc.id):[game.id]);
      const hiddenIds=hiddenGameIds();
      for(const id of ids){if(hidden)hiddenIds.add(id);else hiddenIds.delete(id);}
      const next={...library,hidden_game_ids:[...hiddenIds]};
      await scanner.saveLibrary(libraryFile,next);library=next;
      return {games:publicGames(),hidden_games:publicHiddenGames()};
    }));
    handle('theme:get',()=>themeState(importedTheme));
    handle('admin:access',section=>({pin_required:pinRequiredFor(checkSection(section))}));
    handle('admin:pin-protection',required=>serialized(async()=>{
      requireAdmin('dashboard');if(typeof required!=='boolean')throw Error('Invalid PIN protection setting');
      if(required&&library.pin_is_default)throw Error('Set a PIN first: PIN and locks › New PIN.');
      const next={...library,admin_pin_required:required};await scanner.saveLibrary(libraryFile,next);library=next;
      return {pin_required:required};
    }));
    handle('admin:theme-select',id=>serialized(async()=>{
      requireAdmin('dashboard');
      if(id!==null && !themeState(importedTheme).backgrounds.some(b=>b.id===id))throw new Error('Unknown theme');
      if(!importedTheme)return themeState(null);
      const provider=themeProvider(),config={...provider.config(importedTheme),selected:id};const next={...library,[provider.key]:config};
      await scanner.saveLibrary(libraryFile,next);library=next;importedTheme.selected=id;return themeState(importedTheme);
    }));
    handle('admin:unlock', (pin, section) => {
      const scope = checkSection(section);
      if (pinRequiredFor(scope)) {
        if (Date.now() < blockedUntil) throw new Error('Too many attempts. Wait 30 seconds.');
        if (!scanner.verifyPin(pin, library.admin_credential)) { if (++attempts >= 5) { blockedUntil = Date.now() + 30000; attempts = 0; } throw new Error('Incorrect PIN'); }
      }
      attempts = 0; adminSessions.set(scope, Date.now() + 300000); return true;
    });
    // The view of the dashboard (a skin). The name is checked by the screen against the skins it has; here it only has to be
    // a plain name. Each skin keeps its own theme pack choice, so switching never loses the other one's wallpaper.
    handle('admin:skin',name=>serialized(async()=>{
      requireAdmin('dashboard');if(typeof name!=='string'||!Object.hasOwn(THEME_PROVIDERS,name))throw Error('Invalid view');
      const next={...library,skin:name};await scanner.saveLibrary(libraryFile,next);library=next;importedTheme=await loadSkinTheme();return themeState(importedTheme);
    }));
    // The install wizard. On a first run it opens a session for the Xenia and Dashboard screens without asking the PIN of a
    // fresh install; run again later (from the unlocked Dashboard Settings) it opens nothing extra.
    handle('wizard:state',()=>({first_run:wizardState.isFirstRun(library)}));
    handle('wizard:begin',()=>{
      if(wizardState.isFirstRun(library)||wizardSession){wizardSession=true;return {session:true};}
      requireAdmin('dashboard');return {session:false};
    });
    handle('wizard:end',()=>serialized(async()=>{
      if(wizardSession){wizardSession=false;for(const id of SECTION_IDS)adminSessions.delete(id);}
      const next=wizardState.markDone(library);await scanner.saveLibrary(libraryFile,next);library=next;return true;
    }));
    handle('admin:animations',mode=>serialized(async()=>{
      requireAdmin('dashboard');if(!ANIMATION_MODES.includes(mode))throw Error('Invalid animation setting');
      const next={...library,animations:mode};await scanner.saveLibrary(libraryFile,next);library=next;return themeState(importedTheme);
    }));
    // Volume, music and sound effects: settings of the app itself, for every view.
    handle('admin:sound',(kind,value)=>serialized(async()=>{
      requireAdmin('dashboard');
      // The notification time is in seconds, 0 (no notifications) to 5 in steps of half a second.
      const key={music:'music_enabled',effects:'effects_enabled',volume:'volume',notice_seconds:'notice_seconds'}[kind];
      const bad=kind==='volume'?typeof value!=='number'||!Number.isFinite(value)||value<0||value>1
        :kind==='notice_seconds'?typeof value!=='number'||!Number.isFinite(value)||value<0||value>5||!Number.isInteger(value*2)
        :typeof value!=='boolean';
      if(!key||bad)throw Error('Invalid sound setting');
      const next={...library,[key]:value};await scanner.saveLibrary(libraryFile,next);library=next;return themeState(importedTheme);
    }));
    // The boot animation plays when the dashboard opens: the view's own video, a chosen view's video, or none.
    handle('admin:boot-animation',choice=>serialized(async()=>{
      requireAdmin('dashboard');if(typeof choice!=='string'||!/^[a-z][a-z0-9-]{0,30}$/.test(choice))throw Error('Invalid boot animation setting');
      const next={...library,boot_animation:choice};await scanner.saveLibrary(libraryFile,next);library=next;return themeState(importedTheme);
    }));
    // Fullscreen or windowed, applied at once. Not while a game runs.
    handle('admin:window-mode',mode=>serialized(async()=>{
      requireAdmin('dashboard');if(!['fullscreen','windowed'].includes(mode))throw Error('Invalid window mode');
      if(child||launchPending)throw Error('Close the running game first.');
      await setWindowMode(mode);return themeState(importedTheme);
    }));
    handle('admin:security',()=>{requireAdmin('dashboard');return {admin_pin_required:library.admin_pin_required!==false,locked_sections:lockedSections()};});
    handle('admin:set-pin',pin=>serialized(async()=>{
      requireAdmin('dashboard');if(typeof pin!=='string'||!/^\d{4,8}$/.test(pin))throw new Error('PIN must be 4–8 digits');
      const next={...library,admin_credential:scanner.hashPin(pin),pin_is_default:false};await scanner.saveLibrary(libraryFile,next);library=next;return true;
    }));
    handle('admin:lock', () => { adminSessions.clear(); });
    handle('admin:section-lock',(section,locked)=>serialized(async()=>{
      requireAdmin('dashboard');if(!SECTION_IDS.includes(section)||typeof locked!=='boolean')throw Error('Invalid section lock');
      const next={...library,locked_sections:SECTION_IDS.filter(id=>id===section?locked:lockedSections().includes(id))};
      await scanner.saveLibrary(libraryFile,next);library=next;return {locked_sections:lockedSections()};
    }));
    handle('admin:cover-rescan',()=>serialized(async()=>{
      requireAdmin('dashboard');const games=await scanFolders();requireAdmin('dashboard');
      const next={...library,games};await scanner.saveLibrary(libraryFile,next);library=next;coverRevision++;return publicGames();
    }));
    // The Folders screen: ROM folders, where the dashboard keeps Xenia, and Xenia's own content folder (read from its config).
    const foldersView = async () => {
      let content_root = null;
      try { content_root = await xeniaContentRoot(xeniaLocation()); } catch { /* no Xenia yet, or no config yet */ }
      return { rom_directories: scanner.romFolders(library), native_games:nativeGames.entries(library).map(entry=>({id:nativeGames.gameId(entry.path),path:entry.path,title:entry.title})),native_hint:nativeGames.fileHint(process.platform), install_root: installsRoot(), install_is_default: !library.xenia_install_dir, content_root, admin_pin_required:library.admin_pin_required!==false,locked_sections:lockedSections() };
    };
    handle('admin:settings', () => { requireAdmin('xenia'); return foldersView(); });
    // Locations: the ROM folders. Adding or removing saves at once; the library is rescanned when the screen is left.
    const saveRomFolders = async folders => { const next = { ...library, rom_directories: folders, rom_directory: folders[0] || '' }; await scanner.saveLibrary(libraryFile, next); library = next; return { folders }; };
    handle('xenia:roms-add', () => serialized(async () => {
      requireAdmin('xenia');
      if (pickerOpen) throw new Error('A file picker is already open');
      pickerOpen = true; let picked = [];
      try {
        const have = scanner.romFolders(library);
        const result = await dialog.showOpenDialog(win, { title: 'Choose ROM folders', defaultPath: have.at(-1) || undefined, properties: ['openDirectory', 'multiSelections', ...(process.platform === 'win32' ? ['dontAddToRecent'] : [])] });
        requireAdmin('xenia'); // A dialog cannot extend an expired PIN session.
        picked = result.canceled ? [] : result.filePaths;
      } finally { pickerOpen = false; }
      const have = scanner.romFolders(library);
      const fresh = picked.filter(folder => typeof folder === 'string' && folder.length <= 4096 && !folder.includes('\0') && path.isAbsolute(folder) && !have.some(known => path.resolve(known) === path.resolve(folder)));
      return fresh.length ? saveRomFolders([...have, ...fresh]) : { folders: have };
    }));
    handle('xenia:roms-remove', folder => serialized(async () => {
      requireAdmin('xenia');
      const have = scanner.romFolders(library);
      if (!have.includes(folder)) throw new Error('That folder is not in the list');
      return saveRomFolders(have.filter(known => known !== folder));
    }));
    // Native games (recomps, PC ports): picked as files, each added with the name the user types. Only a file from the
    // last picker can be added, so the renderer can never point the library at a path of its own.
    let pendingNative=new Set(),offeredRunners=new Set();
    const nativeEntry=id=>{const entry=nativeGames.entries(library).find(item=>nativeGames.gameId(item.path)===id);if(!entry)throw Error('Unknown native game');return entry;};
    const nativeTitle=title=>{if(!nativeGames.validTitle(title))throw Error('Invalid game name');return title.trim();};
    // Only the native games are rebuilt; the Xenia games (a walk over every ROM folder) stay as they are.
    const saveNative=async list=>{
      const failed=[],before={...library,native_games:list},natives=await (library=before,scanNative(failed));
      const next={...before,games:[...before.games.filter(game=>game.kind!=='native'),...natives].sort(byTitle)};
      await scanner.saveLibrary(libraryFile,next);library=next;coverRevision++;
      if(failed.length)scanError=`Could not read: ${failed.join(', ')}`;
      return publicGames();
    };
    handle('native:pick',()=>serialized(async()=>{
      requireAdmin('xenia');
      if(pickerOpen)throw Error('A file picker is already open');
      pickerOpen=true;let picked=[];
      try{
        const last=nativeGames.entries(library).at(-1);
        const result=await dialog.showOpenDialog(win,{title:'Choose games',defaultPath:last?path.dirname(last.path):undefined,properties:['openFile','multiSelections',...(process.platform==='win32'?['dontAddToRecent']:[])],filters:nativeGames.pickerFilters(process.platform)});
        requireAdmin('xenia');
        picked=result.canceled?[]:result.filePaths;
      }finally{pickerOpen=false;}
      const have=new Set(nativeGames.entries(library).map(entry=>path.resolve(entry.path)));
      const files=[...new Set(picked)].filter(file=>nativeGames.isNativePath(file,process.platform)&&!have.has(path.resolve(file)));
      pendingNative=new Set(files);return {files};
    }));
    handle('native:add',(file,title)=>serialized(async()=>{
      requireAdmin('xenia');
      if(typeof file!=='string'||!pendingNative.has(file))throw Error('That file is not one you picked');
      const name=nativeTitle(title);pendingNative.delete(file);
      return {id:nativeGames.gameId(file),games:await saveNative([...nativeGames.entries(library),{path:file,title:name}])};
    }));
    handle('native:remove',id=>serialized(async()=>{requireAdmin('xenia');nativeEntry(id);return {games:await saveNative(nativeGames.entries(library).filter(item=>nativeGames.gameId(item.path)!==id))};}));
    handle('native:rename',(id,title)=>serialized(async()=>{
      requireAdmin('xenia');nativeEntry(id);const name=nativeTitle(title);
      return {games:await saveNative(nativeGames.entries(library).map(item=>nativeGames.gameId(item.path)===id?{...item,title:name}:item))};
    }));
    // Run with: Linux, Windows .exe games only. Only a runner this list offered, or a file the user picks, can be saved.
    const runnerGame=id=>{const entry=nativeEntry(id);if(process.platform!=='linux'||path.extname(entry.path).toLowerCase()!=='.exe')throw Error('This game needs no runner');return entry;};
    handle('native:runners',async id=>{
      requireAdmin('xenia');const entry=runnerGame(id);
      const options=await runners.detect({home:app.getPath('home'),pathEnv:process.env?.PATH||''});offeredRunners=new Set(options.map(option=>option.path));
      return {current:entry.runner||null,default:library.runner&&library.runner!=='native'?library.runner:'wine',options};
    });
    handle('native:set-runner',(id,value)=>serialized(async()=>{
      requireAdmin('xenia');runnerGame(id);
      let runner=null;
      if(value==='choose'){
        if(pickerOpen)throw Error('A file picker is already open');
        pickerOpen=true;let result;
        try{result=await dialog.showOpenDialog(win,{title:'Choose Wine or Proton',properties:['openFile']});requireAdmin('xenia');}finally{pickerOpen=false;}
        if(result.canceled||!result.filePaths[0])return {current:runnerGame(id).runner||null};
        runner=result.filePaths[0];if(typeof runner!=='string'||!path.isAbsolute(runner)||runner.includes('\0'))throw Error('Unknown runner');
      }else if(value!==null){if(typeof value!=='string'||!offeredRunners.has(value))throw Error('Unknown runner');runner=value;}
      const next={...library,native_games:nativeGames.entries(library).map(item=>{if(nativeGames.gameId(item.path)!==id)return item;const {runner:_old,...rest}=item;return runner?{...rest,runner}:rest;})};
      await scanner.saveLibrary(libraryFile,next);library=next;
      return {current:runner};
    }));
    handle('xenia:roms-rescan', () => serialized(async () => {
      requireAdmin('xenia');
      const games = await scanFolders();
      requireAdmin('xenia'); const next = { ...library, games }; await scanner.saveLibrary(libraryFile, next); library = next; coverRevision++; return publicGames();
    }));
    handle('xenia:settings',async gameId=>{requireAdmin('xenia');const view=xeniaView(await xeniaFiles(gameId));requireAdmin('xenia');return view;});
    handle('xenia:set',(gameId,id,value)=>serialized(async()=>{
      requireAdmin('xenia');requireIdle();const files=await xeniaFiles(gameId);
      const result=xeniaSettings.apply(files.global,files.override,id,value,files.game,files.profiles);
      requireAdmin('xenia');requireIdle();
      if(files.game){if(result.override)await xeniaConfig.write(files.gameFile,result.override);else await xeniaConfig.remove(files.gameFile);files.override=result.override;}
      else{await xeniaConfig.write(files.location.file,result.global);files.global=result.global;}
      return xeniaView(files);
    }));
    handle('xenia:reset',(gameId,id)=>serialized(async()=>{
      requireAdmin('xenia');requireIdle();const files=await xeniaFiles(gameId);
      if(!files.game)throw Error('Only per-game settings can be reset');
      const override=xeniaSettings.reset(files.global,files.override,id);
      requireAdmin('xenia');requireIdle();
      if(override)await xeniaConfig.write(files.gameFile,override);else await xeniaConfig.remove(files.gameFile);
      files.override=override;return xeniaView(files);
    }));
    handle('xenia:patches',async gameId=>{requireAdmin('xenia');const view=await patchView(gameId);requireAdmin('xenia');return view;});
    handle('xenia:patch-set',(gameId,name,enabled)=>serialized(async()=>{
      requireAdmin('xenia');requireIdle();const location=xeniaLocation(),game=xeniaGame(gameId);if(!game)throw Error('Choose a game first');
      await xeniaPatches.toggle(location.storage,game.title_id,name,enabled);return patchView(gameId);
    }));
    handle('xenia:patch-download',gameId=>serialized(async()=>{
      requireAdmin('xenia');requireIdle();const location=xeniaLocation(),game=xeniaGame(gameId);if(!game)throw Error('Choose a game first');
      const downloaded=await xeniaPatches.download(location.storage,game.title_id,(url,limit)=>covers.request(url,(...args)=>net.fetch(...args),limit));
      requireAdmin('xenia');return {...await patchView(gameId),downloaded};
    }));
    handle('xenia:game-info',async gameId=>{
      requireAdmin('xenia');const game=xeniaGame(gameId);if(!game)throw Error('Choose a game first');
      const discs=library.games.filter(g=>g.title_id===game.title_id),result={game:{...game,media_ids:[...new Set(discs.map(g=>g.media_id).filter(Boolean))],discs:discs.length},info:null,info_error:'',installed:null};
      try{result.info=await gameInfo.metadata(game.title_id,(url,limit)=>covers.request(url,(...args)=>net.fetch(...args),limit),path.join(app.getPath('userData'),'info'));}catch(error){result.info_error=error.message;}
      try{
        const contentRoot=await xeniaContentRoot(xeniaLocation());
        result.installed=await gameInfo.installed(contentRoot,game.title_id);
        result.achievements=[];
        for(const profile of await profiles.list(contentRoot)){const list=await profiles.achievements(contentRoot,profile.xuid,game.title_id).catch(()=>null);if(list)result.achievements.push({...profile,achievements:list});}
      }catch{/* Xenia not configured: show metadata only. */}
      requireAdmin('xenia');return result;
    });
    // Installing and updating Xenia itself (Xenia Settings › Updates). Every call needs the Xenia session; installs
    // only start when the user asks, and the executable the dashboard launches is never changed behind their back.
    handle('xenia:updates-status',async()=>{requireAdmin('xenia');return updatesStatus();});
    handle('xenia:updates-check',async channel=>{
      requireAdmin('xenia');const platform=updatesPlatform(channel);
      const request=(url,limit)=>covers.request(url,(...args)=>net.fetch(...args),limit);
      const release=await xeniaReleases.latest(channel,platform,request);
      // Which official build the dashboard is launching today, so "Not installed" never hides a Xenia that is there.
      let current_tag=null;
      try{current_tag=await xeniaReleases.identify(library.xenia_executable,channel,platform,request,release);}catch{/* an unreadable file just stays unidentified */}
      requireAdmin('xenia');return {...release,current_tag};
    });
    handle('xenia:updates-install',channel=>serialized(async()=>{requireAdmin('xenia');await installXenia(channel,()=>requireAdmin('xenia'));await rememberXenia();return updatesStatus();}));
    handle('xenia:updates-use',channel=>serialized(async()=>{requireAdmin('xenia');requireIdle();await useInstalled(channel,updatesPlatform(channel));await rememberXenia();return updatesStatus();}));
    // "Install folder" row: pick where the downloaded Xenia lives (or go back to the default). Existing builds move along.
    handle('xenia:updates-folder',action=>serialized(async()=>{
      requireAdmin('xenia');requireIdle();
      if(!['choose','default'].includes(action))throw Error('Invalid action');
      let target=null;
      if(action==='choose'){
        if(pickerOpen)throw Error('A file picker is already open');
        pickerOpen=true;
        try{
          const result=await dialog.showOpenDialog(win,{title:'Choose where Xenia is stored',defaultPath:path.dirname(installsRoot()),properties:['openDirectory','createDirectory',...(process.platform==='win32'?['dontAddToRecent']:[])]});
          requireAdmin('xenia');
          if(result.canceled||!result.filePaths[0])return updatesStatus();
          target=path.join(result.filePaths[0],'xenia');
        }finally{pickerOpen=false;}
      }
      await moveInstalls(target);return updatesStatus();
    }));
    // A Xenia of the user's own (a build they made, one kept elsewhere). The dashboard launches it but never changes it.
    handle('xenia:updates-own',()=>serialized(async()=>{
      requireAdmin('xenia');requireIdle();
      if(pickerOpen)throw Error('A file picker is already open');
      pickerOpen=true;let chosen=null;
      try{
        const result=await dialog.showOpenDialog(win,{title:'Choose your Xenia',defaultPath:library.xenia_executable?path.dirname(library.xenia_executable):undefined,properties:['openFile',...(process.platform==='win32'?['dontAddToRecent']:[])],...(process.platform==='win32'?{filters:[{name:'Windows executable',extensions:['exe']}]}:{})});
        requireAdmin('xenia');chosen=result.canceled?null:result.filePaths[0]||null;
      }finally{pickerOpen=false;}
      if(chosen){
        if(!path.isAbsolute(chosen)||chosen.length>4096||chosen.includes('\0'))throw Error('Invalid Xenia path');
        await fs.access(chosen);const next={...library,xenia_executable:chosen};await scanner.saveLibrary(libraryFile,next);library=next;await rememberXenia();
      }
      return updatesStatus();
    }));
    // Xenia's own content folder (DLC, saves, title updates). Only the setting changes; whatever is in the old folder stays there.
    handle('xenia:content-folder',action=>serialized(async()=>{
      requireAdmin('xenia');requireIdle();
      if(!['choose','default'].includes(action))throw Error('Invalid action');
      const location=xeniaLocation();let text;
      try{text=await xeniaConfig.read(location.file);}catch(error){if(error.code==='ENOENT')throw Error(`Xenia has not created ${path.basename(location.file)} yet. Start any game once, then come back.`);throw error;}
      let value='';
      if(action==='choose'){
        if(pickerOpen)throw Error('A file picker is already open');
        pickerOpen=true;
        try{
          const result=await dialog.showOpenDialog(win,{title:'Choose Xenia content folder',defaultPath:await xeniaContentRoot(location,text),properties:['openDirectory','createDirectory',...(process.platform==='win32'?['dontAddToRecent']:[])]});
          requireAdmin('xenia');
          if(result.canceled||!result.filePaths[0])return foldersView();
          value=result.filePaths[0];
        }finally{pickerOpen=false;}
        if(!path.isAbsolute(value)||value.length>4096||value.includes('\0'))throw Error('Invalid folder');
      }
      requireAdmin('xenia');await xeniaConfig.write(location.file,xeniaConfig.setValue(text,'Storage','content_root',value));
      return foldersView();
    }));
    handle('xenia:updates-rollback',channel=>serialized(async()=>{
      requireAdmin('xenia');requireIdle();await xeniaReleases.rollback(installsRoot(),channel,updatesPlatform(channel));await rememberXenia();return updatesStatus();
    }));
    // Community-optimized settings for one game (Game menu › Optimized settings). The check is read-only; apply
    // re-downloads and re-plans in this process rather than trusting what the screen showed.
    handle('xenia:optimized-check',gameId=>serialized(async()=>{requireAdmin('xenia');return optimizedView(await xeniaFiles(gameId));}));
    handle('xenia:optimized-apply',gameId=>serialized(async()=>{
      requireAdmin('xenia');requireIdle();const files=await xeniaFiles(gameId);
      const found=await optimizedSettings.fetchSettings(files.game.title_id,(...args)=>net.fetch(...args));
      if(!found)throw Error('There are no community settings for this game yet.');
      const result=optimizedSettings.plan(files.global,files.override,found.text);
      if(!result.changes.length)throw Error('Nothing to change: this game already has these settings.');
      requireAdmin('xenia');
      await xeniaConfig.write(files.gameFile,optimizedSettings.apply(files.override,result.changes));
      return {applied:result.changes.length,skipped:result.skipped.length};
    }));
    // Game menu › DLC and updates. Install copies a package found in the ROM folder into Xenia's shared content folder.
    handle('xenia:content-check',gameId=>serialized(async()=>{requireAdmin('xenia');return contentView(gameId);}));
    handle('xenia:content-install',(gameId,source)=>serialized(async()=>{
      requireAdmin('xenia');requireIdle();const files=await xeniaFiles(gameId),root=await xeniaContentRoot(files.location,files.global);
      const item=typeof source==='string'?foundPackages.find(found=>found.path===source):null;
      if(!item||item.title_id!==files.game.title_id)throw Error('That package was not found for this game. Open DLC and updates again.');
      requireAdmin('xenia');
      const result=await contentInstaller.install(item.path,root,{onProgress:progress=>{if(win&&!win.isDestroyed())win.webContents.send('content:progress',progress);}});
      return {done:{kind:result.kind,label:result.label,name:path.basename(result.path)},...await contentView(gameId)};
    }));
    // ---- Cover manager. One set of calls for every source (see cover-sources.js): the per-game screen (Game menu ›
    // Change cover) needs the Xenia session, the bulk download (Dashboard Settings › Game covers) the Dashboard one,
    // and the two share the status and one-time download of a source's data.
    const coverSources=coverSourcesModule.create({fetcher:(...args)=>net.fetch(...args),setupFetcher:xeniaReleases.httpsFetcher,directory:path.join(app.getPath('userData'),'launchbox')});
    const coverSource=id=>{const found=typeof id==='string'?coverSources.get(id):null;if(!found)throw Error('Unknown cover source');return found;};
    const coverGame=gameId=>{const game=library.games.find(g=>g.id===gameId);if(!game)throw Error('Unknown game');return game;};
    // Native games take their covers from every-platform LaunchBox only; Xenia games never do.
    const forNative=id=>id==='launchbox-all';
    const coverSourceFor=(game,id)=>{const source=coverSource(id);if((game.kind==='native')!==forNative(source.id))throw Error('That cover source is not for this game');return source;};
    const coverTitle=game=>groupGames(library.games).find(g=>g.id===game.id)?.title||game.title;
    const requireAnyAdmin=()=>{if(!(sessionValid('*')||sessionValid('xenia')||sessionValid('dashboard')))throw new Error('Admin session expired. Open administrator access again.');};
    const sendCoverProgress=progress=>{if(win&&!win.isDestroyed())win.webContents.send('covers:progress',progress);};
    const previews=new Map();let previewCounter=0;
    const useCover=async(game,image,source,reference)=>{
      const file=await saveCover(game.id,image.bytes,image.extension);
      const next={...library,games:library.games.map(g=>g.id===game.id?{...g,cover_art_path:file,uses_fallback_art:false,cover_source:source,cover_title_id:reference||null}:g)};
      await scanner.saveLibrary(libraryFile,next);library=next;coverRevision++;return publicGames();
    };
    handle('covers:sources',async gameId=>{requireAnyAdmin();const native=gameId!=null&&coverGame(gameId).kind==='native',list=[];for(const source of coverSources.values())if(forNative(source.id)===native)list.push({id:source.id,label:source.label,needs_download:source.needsDownload,...await source.status()});return list;});
    handle('covers:prepare',sourceId=>serialized(async()=>{
      requireAnyAdmin();const source=coverSource(sourceId);
      return {id:source.id,label:source.label,needs_download:source.needsDownload,...await source.prepare(progress=>sendCoverProgress({kind:'download',...progress}))};
    }));
    handle('covers:search',(gameId,sourceId,query)=>{
      requireAdmin('xenia');const game=coverGame(gameId),source=coverSourceFor(game,sourceId);
      if(query===undefined)return source.search(coverTitle(game));
      if(!['launchbox','launchbox-all'].includes(sourceId)||typeof query!=='string'||!query.trim()||query.trim().length>120)throw Error('Invalid LaunchBox search text');
      return source.search(query.trim());
    });
    handle('covers:pictures',(gameId,sourceId,key)=>{requireAdmin('xenia');return coverSourceFor(coverGame(gameId),sourceId).pictures(key);});
    handle('covers:preview',async(gameId,sourceId,key,picture)=>{
      requireAdmin('xenia');
      const image=await coverSourceFor(coverGame(gameId),sourceId).image(key,picture);requireAdmin('xenia');
      const id=++previewCounter;previews.set(id,image);for(const old of [...previews.keys()].slice(0,-6))previews.delete(old);
      return `kratos-art://preview/${id}`;
    });
    handle('covers:apply',(gameId,sourceId,key,picture)=>serialized(async()=>{
      requireAdmin('xenia');const game=coverGame(gameId),source=coverSourceFor(game,sourceId);
      const found=await source.image(key,picture);requireAdmin('xenia');
      const image=localCover.convert(found.bytes,nativeImage);requireAdmin('xenia');
      return useCover(game,image,source.id,sourceId==='xenia-manager'?key:null);
    }));
    handle('covers:local',gameId=>serialized(async()=>{
      requireAdmin('xenia');const game=coverGame(gameId);
      if(pickerOpen)throw Error('A file picker is already open');
      pickerOpen=true;let chosen;
      try{
        const result=await dialog.showOpenDialog(win,{title:'Choose a cover image',properties:['openFile',...(process.platform==='win32'?['dontAddToRecent']:[])],filters:[{name:'Images',extensions:['jpg','jpeg','png','webp']}]});
        chosen=result.canceled?null:result.filePaths[0]||null;
      }finally{pickerOpen=false;}
      requireAdmin('xenia'); // A dialog cannot extend an expired PIN session.
      if(!chosen)return null;
      const image=localCover.convert(await localCover.load(chosen),nativeImage);
      requireAdmin('xenia');return useCover(game,image,'local-file',null);
    }));
    // One pass over the games without art (or every game, when `all`), trying the chosen sources in order. Only a game
    // whose picture was found changes.
    handle('admin:cover-auto',(mode,all)=>serialized(async()=>{
      requireAdmin('dashboard');
      if(typeof mode!=='string'||!Object.hasOwn(coverSourcesModule.AUTO_MODES,mode))throw Error('Unknown cover source');
      const order=coverSourcesModule.AUTO_MODES[mode].map(coverSource);
      for(const source of order)if(!(await source.status()).ready)throw Error(`${source.label} needs its data first: choose “Download ${source.label} data” on this screen.`);
      // Native games keep the cover their owner picked: an unattended match by name across every console guesses wrong too often.
      const xenia=library.games.filter(g=>g.kind!=='native'),wanted=all===true?xenia:xenia.filter(g=>g.uses_fallback_art),files=new Map(); // `all` replaces covers already there; a game nothing is found for keeps its current one.
      let done=0;sendCoverProgress({kind:'auto',done,total:wanted.length});
      for(const game of wanted){
        try{
          for(const source of order){
            const found=await source.auto({title:coverTitle(game),titleId:game.title_id});requireAdmin('dashboard');
            if(!found)continue;
            let image;try{image=localCover.convert(found.bytes,nativeImage);}catch{continue;}
            files.set(game.id,{file:await saveCover(game.id,image.bytes,image.extension),source:source.id,reference:found.reference});break;
          }
        }finally{sendCoverProgress({kind:'auto',done:++done,total:wanted.length});}
      }
      const next={...library,auto_cover_source:mode,games:library.games.map(g=>files.has(g.id)?{...g,cover_art_path:files.get(g.id).file,uses_fallback_art:false,cover_source:files.get(g.id).source,cover_title_id:files.get(g.id).reference||null}:g)};
      await scanner.saveLibrary(libraryFile,next);library=next;coverRevision++;
      return {games:publicGames(),downloaded:files.size,missing:wanted.length-files.size};
    }));
    handle('admin:exit', () => { requireAdmin('dashboard'); allowQuit = true; app.quit(); });
    // Dashboard Settings › Updates. Every call needs the Dashboard session and takes only fixed values: the renderer never passes a URL.
    handle('updates:app-state',()=>{requireAdmin('dashboard');return appUpdateState();});
    handle('updates:app-mode',(item,mode)=>serialized(async()=>{
      requireAdmin('dashboard');if(!['dashboard','xenia'].includes(item)||!['notify','auto'].includes(mode))throw Error('Invalid update setting');
      const next={...library,[`update_mode_${item}`]:mode};await scanner.saveLibrary(libraryFile,next);library=next;return appUpdateState();
    }));
    handle('updates:app-check',async()=>{requireAdmin('dashboard');const state=await checkAppUpdates();requireAdmin('dashboard');return state;});
    // "Update to…": download (progress on the row), then the installer closes the app, installs and opens it again.
    // The download can take a long time and is memoised, so it runs OUTSIDE the settings queue; only the install itself is serialized.
    handle('updates:app-install',async()=>{
      requireAdmin('dashboard');
      if(gameRunning())throw Error('Close the running game first.');
      if(!updatePolicy.canSelfUpdate(await dashboardKind()))throw Error('This copy of the dashboard cannot update itself: open the release page instead.');
      if(!dashboardLatest)throw Error('No update to install. Check again first.');
      if(!await downloadDashboard())throw Error('Could not download the update.');
      return serialized(async()=>{
        if(gameRunning())throw Error('Close the running game first.');
        allowQuit=true;   // the installer closes the app
        try{dashboardUpdater().installNow();}
        catch(error){allowQuit=false;throw new Error(`Could not start the update: ${error?.message||error}`);}
        // quitAndInstall can also fail without throwing: if the app is still running a while later, closing needs the PIN again.
        setTimeout(()=>{allowQuit=false;},INSTALL_QUIT_GRACE).unref?.();
      });
    });
    // Xenia's "Update to…": only the latest build of the managed channel in use, the same install as Xenia Settings › Updates.
    handle('updates:xenia-install',()=>serialized(async()=>{
      requireAdmin('dashboard');
      const used=managedXenia(await updatesStatus());
      if(!used)throw Error('Only a Xenia installed by the dashboard and in use can be updated here.');
      const release=await installXenia(used.id,()=>requireAdmin('dashboard'));
      await rememberXenia();
      xeniaUpdate={channel:used.id,label:used.label,installed:release.tag,latest:null,managed:true};
      return appUpdateState();
    }));
    handle('updates:open-release-page',async()=>{requireAdmin('dashboard');await shell.openExternal(RELEASE_PAGE);});
    const fullscreen = windowMode() === 'fullscreen';
    win = new BrowserWindow({ icon: path.join(ROOT, 'assets', 'icon.png'), title: 'Xenia Dashboard', kiosk: fullscreen, fullscreen, minWidth: 960, minHeight: 540, ...(fullscreen ? {} : windowedBounds()), autoHideMenuBar: true, backgroundColor: '#07090c', webPreferences: { preload: path.join(__dirname, 'preload.js'), nodeIntegration: false, contextIsolation: true, sandbox: true, devTools: false } });
    win.setMenu(null);
    // Alt+F4 / the window manager's close. With no PIN guarding the Dashboard it simply closes; otherwise it
    // opens the exit window, which asks for the Dashboard session. A running game is left alone.
    win.on('close', event => {
      if (windowMode() === 'windowed' && !win.isFullScreen() && !win.isMinimized()) { library = { ...library, window_bounds: win.getBounds() }; scanner.saveLibrary(libraryFile, library).catch(() => {}); }
      if (allowQuit) return;
      event.preventDefault();
      if (child || launchPending) return;
      if (!pinRequiredFor('dashboard')) { allowQuit = true; app.quit(); return; }
      win.webContents.send('app:close-request');
    });
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', event => event.preventDefault());
    win.webContents.on('will-frame-navigate',event=>event.preventDefault());
    win.webContents.on('will-attach-webview', event => event.preventDefault());
    win.webContents.on('before-input-event', (event, input) => {
      const admin = adminActive();
      const editShortcut = admin && input.control && !input.alt && !input.meta && ['a', 'c', 'v', 'x', 'z', 'y'].includes(input.key.toLowerCase());
      // Alt+Enter switches between fullscreen and windowed, with or without a PIN: it only changes the window.
      if (input.type === 'keyDown' && input.alt && !input.control && !input.meta && input.key === 'Enter') {
        event.preventDefault();
        if (!child && !launchPending && !input.isAutoRepeat) setWindowMode(windowMode() === 'windowed' ? 'fullscreen' : 'windowed').catch(error => console.warn('[Xenia Dashboard] Window mode:', error.message));
        return;
      }
      if (input.alt || input.meta || (input.control && !editShortcut) || ['F11', 'F12'].includes(input.key)) event.preventDefault();
    });
    win.webContents.on('did-fail-load', (_event, code, description, _url, isMainFrame) => {
      if (isMainFrame) console.error(`[Xenia Dashboard] Window failed to load (${code}): ${description}`);
    });
    win.webContents.on('render-process-gone', (_event, details) => console.error(`[Xenia Dashboard] Renderer stopped: ${details.reason} (exit ${details.exitCode})`));
    win.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    win.webContents.session.setPermissionCheckHandler(()=>false);
    await win.loadURL(RENDERER_URL); shortcuts();
    setTimeout(runStartupUpdateChecks,STARTUP_CHECK_DELAY).unref?.(); // the update checks, in the background; they never hold the app open
    console.info('[Xenia Dashboard] Dashboard loaded.');
  }).catch(error => { console.error(error); allowQuit = true; app.quit(); });
}
app.on('before-quit', event => { if (win && !allowQuit) event.preventDefault(); });
// Automatic: a finished download installs when the user closes the app (electron-updater runs it on quit, without reopening it),
// and only while Automatic is still chosen and no game is running.
app.on('before-quit', () => { if (allowQuit && dashboardDownloaded) selfUpdater?.installOnQuit(updateModes().dashboard === 'auto' && !gameRunning()); });
// Logging out or `kill` must not leave NXE hanging behind its own quit guard.
for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(signal, () => { allowQuit = true; app.quit(); });
app.on('will-quit', () => globalShortcut.unregisterAll());
