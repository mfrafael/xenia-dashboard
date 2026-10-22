'use strict';
let gamesList = [], hiddenGamesList = [], mode = 'library', busy = false, selected = 0, pin = '', settings = {}, editKey = '', editText = '', caps = false;
const api = window.electronAPI;
// Three layers (see dashboard/): sections say WHAT is shown, the navigator decides HOW focus moves,
// the skin draws it. This file wires them to the admin screens, which still live here for now.
const NXE = window.NXE;
const sections = NXE.createSectionRegistry();
const nav = NXE.createNavigator({ sections, count: id => sections.get(id).items().length, axis: NXE.skins.use('nxe').axis || 'vertical' });
// The view of the dashboard. A skin brings its own stylesheet and page pieces; the app only talks to the contract.
let skin = null;
function useSkin(name) {
  skin?.unmount?.();
  skin = NXE.skins.use(name);
  const sheet = document.getElementById('skin-css'); if (skin.stylesheet && sheet?.getAttribute?.('href') !== skin.stylesheet) sheet?.setAttribute?.('href', skin.stylesheet);
  if (document.body?.dataset) document.body.dataset.skin = skin.name;
  skin.mount({ track: document.getElementById('carousel-track'), title: document.getElementById('active-title'), subtitle: document.getElementById('subtitle'), counter: document.getElementById('counter') });
  nav.setAxis(skin.axis || 'vertical'); nav.setWrap(skin.wrap !== false); nav.setRows(skin.rows ? id => skin.rows(sections.get(id)?.kind) : null);
  const hint=document.querySelector?.('#section-hint .key-badge'); if(hint) hint.textContent=nav.axis==='horizontal'?'← →':nav.axis==='grid'?'LB / RB':'↑ ↓';
}
useSkin('nxe');
// Notifications (the toast): shown one by one, only once the boot animation is over. LB + RB together put up a test one.
const uiNotices=NXE.createNotices({document,sounds:{play:role=>window.uiSounds?.play(role)}});
const testNotice=()=>uiNotices.post({title:'Xenia update available',text:'Xenia Edge · this is a test notification'});
const content = document.getElementById('modal-content');
const errorDisplay = document.getElementById('modal-error');
const pinKeys = ['1','2','3','4','5','6','7','8','9','Back','0','Enter'];
const fields = [['new_pin','New PIN (4–8 digits)']];
// Dashboard Settings › PIN and locks is the one screen built from these rows.
const SECURITY_ROWS=[
  {field:'new_pin',label:'New PIN'},{action:'pin',label:'PIN protection'},
  {action:'lock-xenia',label:'Lock Xenia Settings'},{action:'lock-dashboard',label:'Lock Dashboard Settings'},
  {action:'return',label:'Return to dashboard'}
];
let activeRows=SECURITY_ROWS;
const settingsIndex=key=>activeRows.findIndex(row=>row.field===key||row.action===key);
const backLabel=()=>'Return to dashboard';
let themeState={backgrounds:[],selected:null};
let discView=null;
let motionMode='on';
let pinShown=true,entryAfterUnlock=null,unlockSection,entryMode=null,dialog=null,xeniaReady=true;
let updatesView=null,updatesChannel='edge',updatesLatest={};
let settingsTitle='PIN and locks';
let xeniaView=null,xeniaScope=null,xeniaPath=null,xeniaEdit=null,gameTarget=null,patchView=null;
let textEditAction=null;
function displayedGames(){return discView?discView.game.discs:gamesList;}
function leaveDiscs(){if(!discView)return false;window.uiSounds?.play('back');nav.setIndex('library',discView.returnIndex);discView=null;renderCarousel();return true;}
function returnToLibrary(){if(!discView)return;nav.setIndex('library',discView.returnIndex);discView=null;renderCarousel();}
NXE.registerLibrarySection(sections,{games:displayedGames,total:()=>gamesList.length,xeniaReady:()=>xeniaReady,disc:()=>discView,launch:game=>launchGame(game),options:game=>openGameOptions(game),settings:game=>openGameSettings(game),leaveDiscs});
NXE.registerSettingsSections(sections,{enter:name=>enterFromDashboard(name)});
// NXE is a console-style UI, so its motion is part of the view: animations stay on unless the
// administrator picks Off or Follow system (which honours the desktop's reduce-motion request).
function systemReducesMotion(){return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;}
function reducedMotion(){return motionMode==='off'||(motionMode==='system'&&systemReducesMotion());}
function applyMotion(){skin.setMotion(reducedMotion());}
function applyTheme(state){
  motionMode=['on','system','off'].includes(state.animations)?state.animations:'on';applyMotion();
  window.uiSounds?.configure(state);
  window.uiMusic?.configure(state);
  uiNotices.setSeconds(state.notice_seconds);
  if(state.skin&&state.skin!==skin.name&&NXE.skins.names().includes(state.skin)){useSkin(state.skin);applyMotion();showSectionColumn();}
  themeState=state;skin.applyTheme(state,{status});
  if(gamesList.length)renderCarousel();
}
// Dashboard Settings › View is about how the dashboard looks (the View and, where the view has them, its wallpapers).
// Sound and animations is about the app itself and applies to every view.
const lookLabel=name=>NXE.skins.get(name)?.label||name;
// 'theme' plays the video of the view in use; a video's id always plays that video; 'off' plays none.
const bootById=id=>NXE.boots.find(boot=>boot.id===id)||null;
const bootChoices=()=>[{value:'theme',label:'Follow the view'},{value:'off',label:'Off'},...NXE.boots.map(boot=>({value:boot.id,label:boot.label}))];
const bootName=value=>value==='off'?'off':bootById(value)?bootById(value).label:`follows the view, ${bootById(skin.boot)?.label||lookLabel(skin.name)}`;
let themeRows=[];
const percent=()=>Math.round((themeState.audio?.volume ?? .5)*100);
function renderThemes(){
  mode='themes';selected=0;modal('View','D-pad: choose · A: apply · B: return to settings');
  const wallpaper=themeState.backgrounds.find(b=>b.id===themeState.selected);
  themeRows=[{key:'view',label:`View: ${lookLabel(skin.name)}`},...(themeState.backgrounds.length?[{key:'wallpaper',label:`Wallpaper: ${wallpaper?.label||'default'}`}]:[]),{key:'window',label:`Window: ${themeState.window_mode==='windowed'?'Windowed':'Fullscreen'}`},{key:'return',label:backLabel()}];
  content.replaceChildren(node('p','cover-summary','Changes how the whole dashboard looks and moves. Your games and settings stay the same.'));
  buttons(themeRows.map(row=>row.label),'cover-options',activate);
}
// How long a notification stays up: 0 to 5 seconds in half-second steps (0 = off). ← / → change it on the row; A lists them.
const noticeSeconds=()=>themeState.notice_seconds??5;
const noticeLabel=value=>value===0?'off':`‹ ${value} s ›`;
const NOTICE_STEPS=Array.from({length:11},(_,i)=>i/2);
function stepNotice(delta){
  const next=Math.max(0,Math.min(5,noticeSeconds()+delta));if(next===noticeSeconds())return;
  window.uiSounds?.play(delta<0?'left':'right');keepRow(()=>api.setSound('notice_seconds',next),renderSound);
}
function renderSound(){
  mode='sound';selected=0;modal('Sound and animations','D-pad: choose · A: apply · B: return to settings');
  themeRows=[{key:'volume',label:`Sound volume: ${percent()}%`},{key:'music',label:`Music: ${themeState.sound?.music===false?'off':'on'}`},{key:'effects',label:`Sound effects: ${themeState.sound?.effects===false?'off':'on'}`},{key:'animations',label:`Animations: ${{on:'on',system:'follow system',off:'off'}[motionMode]}${motionMode==='system'?(systemReducesMotion()?' (system: reduced)':' (system: full)'):''}`},{key:'boot',label:`Boot animation: ${bootName(themeState.boot_animation||'theme')}`},{key:'notice',label:`Notification time: ${noticeLabel(noticeSeconds())}`},{key:'return',label:backLabel()}];
  content.replaceChildren(node('p','cover-summary','Settings of the dashboard itself: they stay the same with every view.'));
  buttons(themeRows.map(row=>row.label),'cover-options',activate);
}
// Runs a change, shows what the main process answers and puts the cursor back on the row that was used.
async function keepRow(work,render){
  const choice=selected;busy=true;
  try{const state=await work();if(state)applyTheme(state);render();selected=Math.min(choice,selectableButtons().length-1);highlight();}
  catch(error){errorDisplay.textContent=error.message;}
  finally{busy=false;}
}
// Dashboard Settings › View: the same timeline as the install wizard, drawn in the panel of the view in use.
let viewPicker=null;
function openViewPicker(){
  mode='views';selected=0;modal('View','← →: browse · A: apply · B: return');
  const host=node('div','vp-host');content.replaceChildren(host);
  viewPicker=NXE.createViewPicker({document,host,views:NXE.viewsFromRegistry(NXE.skins),current:skin.name,
    onFocus:()=>window.uiSounds?.play('focus'),onBack:()=>renderThemes(),
    onChoose:async name=>{renderThemes();await keepRow(()=>api.setSkin(name),renderThemes);offerBootOfLook();}});
}
// After changing the View: if a boot animation of another view was picked on purpose, ask whether to follow the new one.
function offerBootOfLook(){
  const current=themeState.boot_animation||'theme';
  const fixed=bootById(current),own=bootById(skin.boot);
  if(!fixed||!own||fixed.id===own.id)return;
  openChoice({title:'Boot animation',text:`The boot animation is fixed to ${fixed.label}. Use the one of ${lookLabel(skin.name)} (${own.label}) too?`,current:'this',
    options:[{value:'this',label:`Yes, use ${own.label}`},{value:'keep',label:`No, keep ${fixed.label}`},{value:'theme',label:'Always use the boot animation of the theme'}],
    onPick:value=>{if(value!=='keep')keepRow(()=>api.setBootAnimation(value==='this'?own.id:'theme'),renderThemes);}});
}
async function activateTheme(){
  const row=themeRows[selected];if(!row||row.key==='return')return returnSettings();
  const keep=work=>keepRow(work,renderThemes);
  if(row.key==='view')return openViewPicker();
  if(row.key==='window')return openChoice({title:'Window',text:'Fullscreen is the console way. Windowed gives the dashboard a title bar you can move and resize. The dashboard restarts to apply it.',options:[{value:'fullscreen',label:'Fullscreen'},{value:'windowed',label:'Windowed'}],current:themeState.window_mode==='windowed'?'windowed':'fullscreen',onPick:value=>keep(()=>api.setWindowMode(value))});
  // The wallpaper changes behind the menu as the cursor moves; A keeps it, B puts the current one back.
  const preview=id=>skin.applyTheme({...themeState,selected:id},{status});
  return openChoice({title:'Wallpaper',text:'Move to preview it. A keeps it, B goes back to the current one.',options:themeState.backgrounds.map(b=>({value:b.id,label:b.label})),current:themeState.selected,onFocus:preview,onCancel:()=>preview(themeState.selected),onPick:id=>keep(()=>api.selectTheme(id))});
}
async function activateSound(){
  const row=themeRows[selected];if(!row||row.key==='return')return returnSettings();
  const keep=work=>keepRow(work,renderSound);
  if(row.key==='volume')return openChoice({title:'Sound volume',options:[0,.25,.5,.75,1].map(value=>({value,label:`${Math.round(value*100)}%`})),current:Math.round((percent()/100)*4)/4,onPick:async value=>{await keep(()=>api.setSound('volume',value));window.uiSounds?.play('select');}});
  if(row.key==='music')return openChoice({title:'Music',text:'The background music of the dashboard. Sound effects have their own switch.',options:ON_OFF,current:themeState.sound?.music!==false,onPick:value=>keep(()=>api.setSound('music',value))});
  if(row.key==='effects')return openChoice({title:'Sound effects',text:'The click and swoosh sounds when you move around. The music has its own switch.',options:ON_OFF,current:themeState.sound?.effects!==false,onPick:value=>keep(()=>api.setSound('effects',value))});
  if(row.key==='notice')return openChoice({title:'Notification time',text:'How long a notification stays on the screen. Off turns the notifications off. Move ← → on the row to change it by half a second.',options:NOTICE_STEPS.map(value=>({value,label:value===0?'Off':`${value} s`})),current:noticeSeconds(),onPick:value=>keep(()=>api.setSound('notice_seconds',value))});
  if(row.key==='boot')return openChoice({title:'Boot animation',text:'The startup video. Follow the view plays the one of the view in use; or pick one to keep it with any view. Any button skips it.',options:bootChoices(),current:themeState.boot_animation||'theme',onPick:value=>keep(()=>api.setBootAnimation(value))});
  return openChoice({title:'Animations',text:'On keeps the cover-flow glide even when the desktop asks to reduce motion.',options:[{value:'on',label:'On'},{value:'system',label:'Follow system'},{value:'off',label:'Off'}],current:motionMode,onPick:value=>keep(()=>api.setAnimations(value))});
}
function returnSettings() { closeModal(); }
function node(tag, className, text) { const el = document.createElement(tag); if (className) el.className = className; if (text !== undefined) el.textContent = text; return el; }
function railCaption(section,items){return section.caption(items,nav.index(section.id));}
function showSectionColumn(direction=null){skin.showSections({sections:sections.list().map(({id,label})=>({id,label})),active:sections.ids().indexOf(nav.section),direction});}
function renderCarousel(direction=null){
  const section=sections.get(nav.section),items=section.items();nav.reclamp(section.id);
  showSectionColumn(direction);
  skin.renderRail(section,items,nav.index(section.id),railCaption(section,items),{direction});
}
function updateCarouselPositions(swap=false){
  const section=sections.get(nav.section),items=section.items();
  skin.focusRail(section,items,nav.index(section.id),railCaption(section,items),{swap:swap===true});
}
function status(message) { document.getElementById('status').textContent=message || ''; }
function launchScreen(visible, title = '') { skin.setLaunch(visible,title); }
async function launchGame(game) {
  if(busy || !game) return;
  window.uiSounds?.play('select');
  if(!discView && game.discs){discView={game,returnIndex:nav.index('library')};nav.setIndex('library',0);renderCarousel();return;}
  window.uiMusic?.stopForGame();
  busy=true; status('Launching game…');launchScreen(true,discView?`${discView.game.title} · ${game.title}`:game.title);
  try { await api.launchXeniaGame(game.id); } catch(error) { busy=false;launchScreen(false);window.uiMusic?.resumeDashboard();status(error.message); }
}
function modal(title,help) {
  document.body.classList.add('modal-open');
  const panel=document.querySelector('.panel');
  if(panel.dataset.mode!==mode && !reducedMotion()) panel.animate?.([{opacity:0,transform:'translateX(50px)'},{opacity:1,transform:'translateX(0)'}],{duration:260,easing:'cubic-bezier(.2,.75,.25,1)'});
  panel.dataset.mode=mode;
  document.getElementById('overlay').classList.remove('hidden');document.getElementById('modal-title').textContent=title;
  const hints=document.getElementById('modal-help');hints.replaceChildren();
  for(const part of help.split(/\b([ABXY])\b/)) {
    if(/^[ABXY]$/.test(part)) {
      const glyph=node('span',`controller-button button-${part.toLowerCase()}`);glyph.setAttribute('role','img');glyph.setAttribute('aria-label',part);
      const img=node('img');img.src=themeState.buttons?.[part] || 'assets/controller-buttons.jpg';if(themeState.buttons?.[part])glyph.classList.add('native-glyph');img.alt='';glyph.append(img);hints.append(glyph);
    } else hints.append(document.createTextNode(part));
  }
  errorDisplay.textContent='';
}
function buttons(labels,className,action,groupStart=-1) {
  const grid=node('div',className);
  labels.forEach((label,index)=>{ const button=node('button',index===selected?'selected':'',label);if(index===groupStart)button.classList.add('group-start');button.addEventListener('focus',()=>{const previous=selected;selected=index;highlight(previous!==index,index<previous?'left':'right');});button.addEventListener('click',()=>{selected=index;action();});grid.append(button); });content.append(grid);
}
function selectableButtons() { return [...content.querySelectorAll(mode==='keyboard'?'.key-grid button':'button')]; }
function highlight(withSound=false,sound='right') { if(withSound)window.uiSounds?.play(mode==='pin'?sound:'focus');selectableButtons().forEach((button,index)=>button.classList.toggle('selected',index===selected));if(mode==='settings')updateSettingsDetails();if(mode==='xenia-items')updateXeniaDetails();if(mode==='patches')updatePatchDetails();if(mode==='updates')updateUpdatesDetails();if(mode==='roms')updateRomsDetails();if(mode==='optimized')updateOptimizedDetails();if(mode==='content')updateContentDetails();if(mode==='covers')updateCoverDetails(); }
async function openPin() {
  if(busy || mode!=='library')return;returnToLibrary();busy=true;
  try {
    const access=await api.getAdminAccess(unlockSection);window.uiSounds?.play('open');mode='pin';pin='';selected=0;
    // No PIN asked: nothing to show, the section just opens (and if it cannot, submitPin says why from the library).
    if(!access.pin_required){pinShown=false;busy=false;return await submitPin(false);}
    pinShown=true;modal('Administrator PIN','Type PIN + Enter, or use the keypad. D-pad: choose · A: enter · X: erase · Y: submit · Esc/B: cancel');renderPin();
  }catch(error){gameTarget=null;entryAfterUnlock=null;unlockSection=undefined;status(error.message);}finally{busy=false;}
}
function renderPin() { content.replaceChildren(node('div','entry','●'.repeat(pin.length) || 'Enter PIN'));buttons(pinKeys,'pin-grid',activate); }
function closeModal() { window.uiSounds?.play('close');mode='library';gameTarget=null;entryAfterUnlock=null;unlockSection=undefined;entryMode=null;activeRows=SECURITY_ROWS;settingsTitle='PIN and locks';xeniaView=null;xeniaEdit=null;textEditAction=null;pin='';editText='';settings={};document.body.classList.remove('modal-open');document.getElementById('overlay').classList.add('hidden');if(!wizardRun?.active)api.lockAdmin().catch(()=>{});if(wizardRun?.active&&!wizardRun.screenClosed())wizardRun.reenter(); }
function lockedSection(id){return (settings.locked_sections||[]).includes(id);}
function renderSettings() {
  content.replaceChildren();buttons(activeRows.map(row=>row.action==='pin'?`PIN protection: ${settings.admin_pin_required===false?'off':'on'}`:row.action?.startsWith('lock-')?`${row.label}: ${lockedSection(row.action.slice(5))?'on':'off'}`:row.label),'settings',activate);
  const list=content.firstElementChild;list.prepend(node('div','settings-highlight'));
  const shell=node('div','settings-shell'),details=node('div','settings-details');
  details.append(node('div','detail-label',themeState.menu?.detailLabel || 'Current setting'),node('div','setting-value'),node('p','setting-description'));
  shell.append(list,details);content.append(shell);updateSettingsDetails();
}
function updateSettingsDetails() {
  const description=['Set a new administrator PIN using 4–8 digits.','Return to Game Library.'];
  const field=activeRows[selected]?.field;
  const value=content.querySelector('.setting-value');
  if(!value)return;
  value.textContent=field?(field==='new_pin'?'●'.repeat(settings[field]?.length || 0):settings[field] || '(not set)'):'Xenia Dashboard';
  const descriptionIndex=field?fields.findIndex(([key])=>key===field):({return:1}[activeRows[selected]?.action]);
  const action=activeRows[selected]?.action;
  content.querySelector('.setting-description').textContent=action==='lock-xenia'||action==='lock-dashboard'?`When on, opening ${action==='lock-xenia'?'Xenia Settings':'Dashboard Settings'} tiles asks for the PIN (while PIN protection is on). When off, that section opens straight away but still cannot reach the other one. Changed immediately.`:action==='pin'?'Toggle PIN protection immediately. When off, Start or Admin opens settings directly, including Exit to desktop. Turning protection back on uses the saved PIN.':action==='themes'?'Choose the original green NXE dashboard or Wallpaper 1–9, and adjust sound volume or mute.':action==='xenia'?'Console, display, graphics, audio, controller and storage settings for Xenia itself, like the Xbox 360 System Settings. Changes are saved to Xenia immediately.':action==='game-settings'?'Pick a game to give it its own Xenia settings. Anything you leave alone follows System settings. Tip: press Y on a game in the library.':action==='covers'?'Download the covers of every game that has none, from the source you choose (Xenia Manager database, LaunchBox, or both), or rescan local cover images. To change a single cover with a preview, press Y on the game and choose Change cover.':description[descriptionIndex] || '';
  if(field==='xenia_executable'&&settings.xenia_executable)content.querySelector('.setting-description').textContent+=settings.xenia_managed?'\n\nInstalled and kept up to date by Xenia Dashboard (Updates).':'\n\nYour own copy: Xenia Dashboard does not install or update it.';
  const button=selectableButtons()[selected],bar=content.querySelector('.settings-highlight');
  if(button && bar){bar.style.height=`${button.offsetHeight}px`;bar.style.transform=`translateY(${button.offsetTop}px)`;}
}
function keyboardKeys() { const letters = 'abcdefghijklmnopqrstuvwxyz';return [...'1234567890',...(caps?letters.toUpperCase():letters),' ',':','/','\\','.','_','-','[',']','"',',','(',')','+','=','@','!','Back','Case','Done']; }
function renderKeyboard(focusInput = false) {
  const entry = node('input', 'entry entry-input');
  entry.type = editKey === 'new_pin' ? 'password' : 'text';
  entry.value = editText; entry.maxLength = textEditAction?.maxLength || 4096;
  entry.setAttribute('aria-label', xeniaEdit ? xeniaEdit.label : textEditAction ? textEditAction.label : fields.find(f => f[0] === editKey)[1]);
  entry.autocomplete = 'off'; entry.spellcheck = false;
  entry.addEventListener('input', () => { editText = entry.value; });
  content.replaceChildren(entry);
  const actions = node('div', 'edit-actions');
  const done = node('button', '', 'Done'); done.addEventListener('click', finishEdit);
  const cancel = node('button', '', 'Cancel'); cancel.addEventListener('click', cancelEdit);
  actions.append(done, cancel); content.append(actions);
  buttons(keyboardKeys(),'key-grid',activate);
  if (focusInput) entry.focus();
}
function editTextEntry(action) {
  textEditAction=action;editKey='text';editText=action.value;mode='keyboard';selected=0;
  modal(action.title,'Type or paste, then Enter. D-pad: move · A: type · X: erase · Y: done · Esc/B: discard');renderKeyboard(true);
}
function editTextLimit() { return textEditAction?.maxLength || 4096; }
function cancelEdit() { if(xeniaEdit){const item=xeniaEdit;xeniaEdit=null;editText='';return renderXeniaItems(Math.max(0,xeniaItems().indexOf(item)));} if(textEditAction){const action=textEditAction;textEditAction=null;editText='';mode='covers';return action.onCancel?.();} editText='';mode='settings';selected=settingsIndex(editKey);modal(settingsTitle,'D-pad: choose · A: edit/select · B: return to the dashboard');renderSettings(); }
async function activate() {
  if(busy) return;
  window.uiSounds?.play(mode==='pin'?(pinKeys[selected]==='Back'?'left':'right'):'select');
  if(mode==='themes')return activateTheme();
  if(mode==='sound')return activateSound();
  if(mode==='xenia-home'){
    const categories=homeCategories(),offset=homeOffset(),index=selected-offset;
    if(offset&&selected===0)return openOptimized();
    if(index>=0&&index<categories.length){xeniaPath={kind:'category',id:categories[index].id};return renderXeniaItems();}
    if(homeHasAdvanced()&&index===categories.length)return renderXeniaAdvanced();
    return entryMode==='game-settings'?closeModal():xeniaScope?renderGameMenu():returnSettings();
  }
  if(mode==='xenia-advanced'){if(selected<xeniaView.advanced.length){xeniaPath={kind:'section',id:xeniaView.advanced[selected].id};return renderXeniaItems();}return renderXeniaHome();}
  if(mode==='xenia-items')return activateXenia();
  if(mode==='game-list'){const list=gameListGames();if(selected>=list.length)return returnSettings();gameTarget={game:list[selected],fromLibrary:false};return renderGameMenu();}
  if(mode==='game-menu')return activateGameMenu();
  if(mode==='patches')return activatePatch();
  if(mode==='updates')return activateUpdate();
  if(mode==='roms')return activateRoms();
  if(mode==='game-info')return backToGameMenu('info');
  if(mode==='optimized')return activateOptimized();
  if(mode==='content')return activateContent();
  if(mode==='covers')return activateCover();
  if(mode==='pin') {
    const key=pinKeys[selected];if(key==='Back')pin=pin.slice(0,-1);else if(key==='Enter')return submitPin(false);else if(pin.length<8)pin+=key;renderPin();
  } else if(mode==='settings') {
    const row=activeRows[selected];
    if(row.field){editKey=row.field;editText=settings[editKey] || '';mode='keyboard';selected=0;modal(`Edit ${fields.find(f=>f[0]===editKey)[1]}`,'Type or paste, then Enter. D-pad: move · A: type · X: erase · Y: done · Esc/B: discard');renderKeyboard(true);}
    else if(row.action?.startsWith('lock-')){
      const id=row.action.slice(5),name=id==='xenia'?'Xenia Settings':'Dashboard Settings';
      return openChoice({title:`Lock ${name}`,text:`On: the ${name} tiles ask for the PIN (while PIN protection is on).`,options:ON_OFF,current:lockedSection(id),onPick:value=>changeSecurity(async()=>{const result=await api.setSectionLock(id,value);settings.locked_sections=result.locked_sections;})});
    }
    else if(row.action==='pin')return openChoice({title:'PIN protection',text:'Off: nothing asks for a PIN, and anyone can change settings and quit.',options:ON_OFF,current:settings.admin_pin_required!==false,onPick:value=>changeSecurity(async()=>{const access=await api.setPinProtection(value);settings.admin_pin_required=access.pin_required;})});
    else closeModal();
  } else if(mode==='keyboard') {
    const key=keyboardKeys()[selected];if(key==='Done')return finishEdit();if(key==='Back')editText=editText.slice(0,-1);else if(key==='Case')caps=!caps;else if(editText.length<editTextLimit())editText+=key;renderKeyboard();
  }
}
async function changeSecurity(work){busy=true;try{await work();renderSettings();}catch(error){errorDisplay.textContent=error.message;}finally{busy=false;}}
async function submitPin(withSound=true) {
  if(busy)return;if(withSound)window.uiSounds?.play('right');busy=true;
  try { await api.unlockAdmin(pin,unlockSection);pin='';if(entryAfterUnlock){const go=entryAfterUnlock;entryAfterUnlock=null;return await go();}if(gameTarget)return renderGameMenu();closeModal(); }
  catch(error){pin='';if(pinShown){renderPin();errorDisplay.textContent=error.message;}else{closeModal();reportProblem(error.message);}}finally{busy=false;}
}
async function finishEdit() {
  if(xeniaEdit)return finishXeniaEdit();
  if(textEditAction){const action=textEditAction,text=editText;textEditAction=null;editText='';mode='covers';return action.onDone(text);}
  const key=editKey,text=editText;editText='';mode='settings';selected=settingsIndex(key);modal(settingsTitle,'D-pad: choose · A: edit/select · B: return to the dashboard');
  if(key!=='new_pin'){settings[key]=text;renderSettings();return;}
  settings.new_pin='';renderSettings();if(!text)return;
  busy=true;try{await api.setPin(text);errorDisplay.textContent='PIN changed.';}catch(error){errorDisplay.textContent=error.message;}finally{busy=false;}
}
// Xenia settings: categories → items. Every change is saved to Xenia's own file at once.
function xeniaValueLabel(item){if(item.type==='string'&&!item.options.length)return item.value||'(default)';const option=item.options.find(o=>o.value===item.value);return option?option.label:String(item.value);}
function xeniaGroup(){return xeniaView&&xeniaPath?(xeniaPath.kind==='section'?xeniaView.advanced:xeniaView.categories).find(g=>g.id===xeniaPath.id):null;}
function xeniaItems(){return xeniaGroup()?.items || [];}
function xeniaTitle(){return xeniaView?.game?`${xeniaView.game.title} · Game settings`:entryMode==='advanced'?'Advanced':'System settings';}
// A problem found while opening a Xenia screen, told in a window instead of the line at the top. The two ways Xenia can be
// missing (not installed here, or installed but never run) say what to do; anything else shows its message.
function reportProblem(raw){
  const message=String(raw).replace(/^Error invoking remote method '[^']*': (Error: )?/,'');
  const ok=[{label:'OK',run:()=>{}}];
  if(/Install or choose a Xenia/.test(message))return showDialog({title:'Xenia is not set up',text:'These settings belong to Xenia, and no Xenia is set up yet. Install one, or choose a copy you already have, now?',
    buttons:[{label:'Set up Xenia',run:()=>enterFromDashboard('xenia:updates')},{label:'Not now',run:()=>{}}],onCancel:()=>{}});
  if(/has not created/.test(message))return showDialog({title:'Start Xenia once',text:FIRST_RUN_TEXT,buttons:ok,onCancel:()=>{}});
  showDialog({title:'Xenia',text:message,buttons:ok,onCancel:()=>{}});
}
// If Xenia cannot be read (it never ran, so it has no settings file yet) the screen is left and the reason shown on the library, not on a PIN pad.
async function openXenia(gameId){busy=true;try{xeniaView=await api.getXeniaSettings(gameId);xeniaScope=gameId;xeniaPath=null;renderXeniaHome();}catch(error){closeModal();reportProblem(error.message);}finally{busy=false;}}
// System settings lists only the system categories. Profiles and Advanced have their own tiles in the Xenia
// section (as Profile sat apart from System Settings on the 360), so they are not repeated here; a game's
// settings keep Advanced because that is the only way to it from there.
function homeCategories(){return xeniaView.categories.filter(category=>xeniaScope!==null||!category.separate);}
function homeHasAdvanced(){return xeniaScope!==null;}
// A game's settings start with its community-optimized settings, set apart from the categories by a line.
function homeOffset(){return xeniaScope!==null?1:0;}
function renderXeniaHome(){
  const categories=homeCategories();
  const offset=homeOffset(),previous=xeniaPath?.kind==='category'?categories.findIndex(c=>c.id===xeniaPath.id)+offset:xeniaPath?.kind==='section'?categories.length+offset:0;
  mode='xenia-home';selected=Math.max(0,previous);xeniaPath=null;modal(xeniaTitle(),'D-pad: choose · A: open · B: return');
  content.replaceChildren(node('p','cover-summary',xeniaView.game?`Changes here apply only to ${xeniaView.game.title} (${xeniaView.game.title_id}). Settings marked ● differ from System settings.`:`Xenia ${xeniaView.flavor.replace(/^xenia-/,'')} · ${xeniaView.file}`));
  buttons([...(offset?['Optimized settings']:[]),...categories.map(c=>c.label),...(homeHasAdvanced()?['Advanced (every Xenia setting)']:[]),xeniaScope?(entryMode==='game-settings'?'Return to games':'Return to game options'):backLabel()],'cover-options',activate,offset?1:-1);
}
function renderXeniaAdvanced(){
  const previous=xeniaPath?.kind==='section'?xeniaView.advanced.findIndex(s=>s.id===xeniaPath.id):0;
  mode='xenia-advanced';selected=Math.max(0,previous);xeniaPath={kind:'section',id:null};modal(entryMode==='advanced'?'Advanced':`${xeniaTitle()} · Advanced`,'D-pad: choose · A: open · B: return');
  content.replaceChildren(node('p','cover-summary','Every section of Xenia\'s configuration. Descriptions come from Xenia itself.'));
  buttons([...xeniaView.advanced.map(s=>`${s.label} (${s.items.length})`),'Return'],'cover-options',activate);
}
function renderXeniaItems(index=0){
  const group=xeniaGroup();if(!group)return renderXeniaHome();
  mode='xenia-items';selected=Math.min(index,group.items.length-1);
  modal(entryMode==='profiles'?group.label:`${xeniaTitle()} · ${group.label}`,`D-pad ↑↓: choose · ←→ or A: change${xeniaView.game?' · X: use system value':''} · B: return`);
  content.replaceChildren();buttons(group.items.map(item=>`${item.overridden?'● ':''}${item.label}: ${xeniaValueLabel(item)}`),'settings',activate);
  const list=content.firstElementChild;list.prepend(node('div','settings-highlight'));
  const shell=node('div','settings-shell'),details=node('div','settings-details');
  details.append(node('div','detail-label'),node('div','setting-value'),node('p','setting-description'));
  shell.append(list,details);content.append(shell);updateXeniaDetails();
}
function updateXeniaDetails(){
  const item=xeniaItems()[selected],value=content.querySelector('.setting-value');if(!item||!value)return;
  content.querySelector('.detail-label').textContent=item.label;
  value.textContent=xeniaValueLabel(item)+(item.overridden?` · System: ${xeniaValueLabel({...item,value:item.system_value})}`:xeniaView.game?' · same as System':'');
  content.querySelector('.setting-description').textContent=`${item.description || ''}\n[${item.section}] ${item.key}`.trim();
  const button=selectableButtons()[selected],bar=content.querySelector('.settings-highlight');
  if(button&&bar){bar.style.height=`${button.offsetHeight}px`;bar.style.transform=`translateY(${button.offsetTop}px)`;}
}
function xeniaNext(item,direction){
  if(item.options.length){const index=item.options.findIndex(o=>o.value===item.value);return item.options[index<0?0:(index+direction+item.options.length)%item.options.length].value;}
  if(item.type==='bool')return !item.value;
  if(item.type==='int'||item.type==='float'){let next=item.value+direction*item.step;if(item.min!==undefined)next=Math.min(item.max,Math.max(item.min,next));return item.type==='float'?Math.round(next*1000)/1000:Math.round(next);}
  return undefined;
}
async function saveXenia(item,value){
  busy=true;const index=selected;
  try{xeniaView=await api.setXeniaSetting(xeniaScope,item.id,value);renderXeniaItems(index);}
  catch(error){errorDisplay.textContent=error.message;}finally{busy=false;}
}
function adjustXenia(direction){
  if(busy)return;const item=xeniaItems()[selected];if(!item)return;
  const next=xeniaNext(item,direction);if(next===undefined||next===item.value)return;
  window.uiSounds?.play(direction<0?'left':'right');return saveXenia(item,next);
}
function numericOptions(item){
  if((item.type!=='int'&&item.type!=='float')||item.min===undefined||item.max===undefined||!(item.step>0))return null;
  const count=Math.floor((item.max-item.min)/item.step+1e-9)+1;if(count<2||count>41)return null;
  const round=value=>Math.round(value*1000)/1000,percent=item.max===1&&item.min===0&&item.type==='float';
  const values=Array.from({length:count},(_,index)=>round(item.min+index*item.step));
  if(!values.includes(item.value))values.push(item.value),values.sort((x,y)=>x-y);
  return values.map(value=>({value,label:percent?`${Math.round(value*100)}%`:String(value)}));
}
function activateXenia(){
  const item=xeniaItems()[selected];if(!item)return;
  // A number with a range and a step (volume, deadzone, frame limit…) is a menu of its steps; free text still opens the keyboard.
  const options=item.options.length?item.options:item.type==='bool'?ON_OFF:numericOptions(item);
  if(options)return openChoice({title:item.label,text:firstSentence(item.description),options,current:item.value,onPick:value=>value===item.value?undefined:saveXenia(item,value)});
  xeniaEdit=item;editKey='xenia';editText=String(item.value);mode='keyboard';selected=0;
  modal(`Edit ${item.label}`,'Type, then Enter. D-pad: move · A: type · X: erase · Y: done · Esc/B: discard');renderKeyboard(true);
}
async function finishXeniaEdit(){
  const item=xeniaEdit,text=editText.trim();let value=editText;
  if(item.type==='int'){if(!/^-?\d+$/.test(text)){errorDisplay.textContent='Enter a whole number.';return;}value=Number(text);}
  else if(item.type==='float'){if(!/^-?(\d+\.?\d*|\.\d+)$/.test(text)){errorDisplay.textContent='Enter a number such as 0.5.';return;}value=Number(text);}
  xeniaEdit=null;editText='';const index=Math.max(0,xeniaItems().indexOf(item));renderXeniaItems(index);
  if(value!==item.value)await saveXenia(item,value);
}
async function resetXenia(){
  const item=xeniaItems()[selected];if(busy||!item?.overridden)return;window.uiSounds?.play('back');
  busy=true;const index=selected;
  try{xeniaView=await api.resetXeniaSetting(xeniaScope,item.id);renderXeniaItems(index);}catch(error){errorDisplay.textContent=error.message;}finally{busy=false;}
}
// B inside the Xenia/game screens walks back one level instead of closing the panel.
function xeniaBack(){
  // A tile that jumped straight into a screen (Profiles, Advanced, a game's settings) goes back to the dashboard from it.
  if(mode==='xenia-items'){if(xeniaPath.kind==='section')renderXeniaAdvanced();else if(entryMode==='profiles')closeModal();else renderXeniaHome();return true;}
  if(mode==='xenia-advanced'){if(entryMode==='advanced')closeModal();else renderXeniaHome();return true;}
  if(mode==='xenia-home'){if(entryMode==='game-settings')closeModal();else if(xeniaScope)renderGameMenu();else returnSettings();return true;}
  if(mode==='game-menu'){if(gameTarget?.fromLibrary)closeModal();else renderGameList();return true;}
  if(mode==='patches')return backToGameMenu('patches');
  if(mode==='game-info')return backToGameMenu('info');
  if(mode==='optimized')return backToGameSettings();
  if(mode==='content')return backToGameMenu('content');
  if(mode==='covers')return coverBack();
  if(mode==='game-list'){returnSettings();return true;}
  return false;
}
function gameListGames(){return [...gamesList.filter(game=>game.title_id),...hiddenGamesList];}
function renderGameList(){
  mode='game-list';const list=gameListGames();selected=Math.max(0,list.findIndex(game=>game.id===gameTarget?.game.id));gameTarget=null;
  modal('Game settings','D-pad: choose game · A: open · B: return');
  content.replaceChildren(node('p','cover-summary',list.length?'Choose a game to give it its own settings, or show a hidden game again.':'No game has a title ID yet. Save and rescan to read them from your game files.'));
  buttons([...list.map(game=>game.hidden?`Hidden: ${game.title}`:game.title),backLabel()],'cover-options',activate);
}
function renderGameMenu(){
  const game=gameTarget.game;mode='game-menu';selected=0;xeniaView=null;xeniaScope=null;xeniaPath=null;
  modal(game.title,'D-pad: choose · A: select · B: return');
  content.replaceChildren(node('p','cover-summary',game.title_id?`Title ID ${game.title_id}`:'This game has no title ID, so Xenia cannot apply per-game settings to it.'));
  buttons(gameMenuEntries().map(entry=>entry.label),'cover-options',activate);
}
// The game menu by name, so adding an entry never shifts what the others open.
function gameMenuEntries(){
  const game=gameTarget.game;
  return [
    ...(game.title_id?[
      {id:'settings',label:'Game settings',run:()=>openXenia(game.id)},
      {id:'content',label:'DLC and updates',run:()=>openContent()}
    ]:[]),
    {id:'cover',label:'Change cover',run:()=>openCoverManager({game,leave:()=>backToGameMenu('cover')})},
    ...(game.title_id?[
      {id:'patches',label:'Patches',run:()=>openPatches()},
      {id:'info',label:'Game details',run:()=>openGameInfo()}
    ]:[]),
    {id:'hidden',label:game.hidden?'Show game':'Hide game',run:()=>toggleGameHidden()},
    {id:'back',label:gameTarget.fromLibrary?'Return to games':'Return to game list',run:()=>gameTarget.fromLibrary?closeModal():renderGameList()}
  ];
}
// Optimized settings sit inside a game's settings; coming back reloads them because applying changed the override.
function backToGameSettings(){openXenia(gameTarget.game.id).then(()=>{selected=0;highlight();});return true;}
function backToGameMenu(id){renderGameMenu();selected=Math.max(0,gameMenuEntries().findIndex(entry=>entry.id===id));highlight();return true;}
function activateGameMenu(){
  const entry=gameMenuEntries()[selected];if(!entry)return;
  if(entry.id!=='back'&&entry.id!=='cover'&&entry.id!=='hidden'&&!gameTarget.game.title_id){errorDisplay.textContent='This game has no title ID.';return;}
  return entry.run();
}
async function toggleGameHidden(){
  const target=gameTarget.game,wasFromLibrary=gameTarget.fromLibrary;
  busy=true;
  try{
    const result=await api.setGameHidden(target.id,!target.hidden);
    gamesList=result.games;hiddenGamesList=result.hidden_games;
    if(wasFromLibrary){closeModal();renderCarousel();status(target.hidden?'Game shown in the library.':'Game hidden from the library.');}
    else{gameTarget={game:{...target,hidden:!target.hidden},fromLibrary:false};renderGameList();}
  }catch(error){errorDisplay.textContent=error.message;}finally{busy=false;}
}
// Patches: Xenia applies the variant whose executable hash matches, so they toggle by name.
async function openPatches(){busy=true;try{patchView=await api.getPatches(gameTarget.game.id);renderPatches();}catch(error){errorDisplay.textContent=error.message;}finally{busy=false;}}
function renderPatches(index=0){
  mode='patches';selected=Math.min(index,patchView.patches.length+1);
  modal(`${gameTarget.game.title} · Patches`,'D-pad: choose · A: turn on/off or download · B: return');
  content.replaceChildren();buttons([patchView.files?'Update patches from game-patches':'Download patches from game-patches',...patchView.patches.map(p=>`${p.enabled?'● ':''}${p.name}: ${p.enabled?'On':'Off'}`),'Return to game options'],'settings',activate);
  const list=content.firstElementChild;list.prepend(node('div','settings-highlight'));
  const shell=node('div','settings-shell'),details=node('div','settings-details');
  details.append(node('div','detail-label'),node('div','setting-value'),node('p','setting-description'));
  shell.append(list,details);
  const note=patchView.apply_patches===false?'Game patches are turned off. Turn them on in Xenia Settings › System › Emulation › Game patches.':patchView.files?`${patchView.files} patch file${patchView.files===1?'':'s'} for title ${patchView.game.title_id}. Xenia uses the one that matches your copy of the game.`:'No patches downloaded for this game yet.';
  content.append(node('p','cover-summary',note),shell);updatePatchDetails();
}
function updatePatchDetails(){
  const value=content.querySelector('.setting-value');if(!value||!patchView)return;
  const patch=patchView.patches[selected-1],label=content.querySelector('.detail-label'),description=content.querySelector('.setting-description');
  if(selected===0){label.textContent='xenia-canary/game-patches';value.textContent=patchView.files?'Refresh every variant of this game\'s patches.':'Fetch every variant of this game\'s patches.';description.textContent='Patches you turned on stay on after an update. Files are stored in Xenia\'s patches folder.';}
  else if(patch){label.textContent=patch.name;value.textContent=`${patch.enabled?'On':'Off'}${patch.author?` · by ${patch.author}`:''}`;description.textContent=`${patch.desc || ''}\nVariants: ${patch.files.join(', ')}`.trim();}
  else{label.textContent='';value.textContent='';description.textContent='';}
  const button=selectableButtons()[selected],bar=content.querySelector('.settings-highlight');
  if(button&&bar){bar.style.height=`${button.offsetHeight}px`;bar.style.transform=`translateY(${button.offsetTop}px)`;}
}
async function activatePatch(){
  if(selected===patchView.patches.length+1){renderGameMenu();selected=1;return highlight();}
  const index=selected;busy=true;
  try{
    if(index===0){errorDisplay.textContent='Downloading patches…';const result=await api.downloadPatches(gameTarget.game.id);patchView=result;renderPatches(0);errorDisplay.textContent=result.downloaded?`${result.downloaded} patch file${result.downloaded===1?'':'s'} downloaded.`:'game-patches has nothing for this title yet.';}
    else{const patch=patchView.patches[index-1];patchView=await api.setPatch(gameTarget.game.id,patch.name,!patch.enabled);renderPatches(index);}
  }catch(error){errorDisplay.textContent=error.message;}finally{busy=false;}
}
async function openGameInfo(){
  busy=true;errorDisplay.textContent='Loading game details…';
  try{renderGameInfo(await api.getGameInfo(gameTarget.game.id));}catch(error){errorDisplay.textContent=error.message;}finally{busy=false;}
}
function renderGameInfo(view){
  mode='game-info';selected=0;const info=view.info,game=view.game;
  modal(`${gameTarget.game.title} · Game details`,'D-pad: scroll · A/B: return');
  const details=node('div','game-details');
  details.append(node('h2','',info?.title || game.title));
  const facts=[info?.developer&&`Developer: ${info.developer}`,info?.publisher&&`Publisher: ${info.publisher}`,info?.genre?.length&&`Genre: ${info.genre.join(', ')}`,info?.release_date&&`Released: ${info.release_date}`,info?.user_rating&&`Rating: ${info.user_rating} / 5`,`Title ID: ${game.title_id}${game.media_ids?.length?` · Media ID: ${game.media_ids.join(', ')}`:''}${game.discs>1?` · ${game.discs} discs`:''}`].filter(Boolean);
  for(const fact of facts)details.append(node('div','game-fact',fact));
  if(view.installed){const i=view.installed;details.append(node('div','game-fact',`Installed in Xenia: ${i.saves} save${i.saves===1?'':'s'} · ${i.downloadable_content} add-on${i.downloadable_content===1?'':'s'} · ${i.title_updates} title update${i.title_updates===1?'':'s'}`));}
  details.append(node('p','game-description',info?.description || (view.info_error?`Details unavailable: ${view.info_error}`:'')));
  for(const profile of view.achievements || []){
    const list=profile.achievements,done=list.filter(a=>a.achieved),score=list.reduce((sum,a)=>sum+a.gamerscore,0),earned=done.reduce((sum,a)=>sum+a.gamerscore,0);
    details.append(node('h3','',`Achievements · ${profile.gamertag}: ${done.length} of ${list.length} · ${earned} / ${score} G`));
    const rows=node('div','achievement-list');
    for(const achievement of list){const row=node('div',`achievement${achievement.achieved?' achieved':''}`);row.append(node('span','achievement-score',`${achievement.gamerscore} G`),node('span','achievement-name',`${achievement.achieved?'✓ ':''}${achievement.name}`),node('span','achievement-text',achievement.description));rows.append(row);}
    details.append(rows);
  }
  content.replaceChildren(details);buttons(['Return to game options'],'cover-options',activate);
}
// Tiles in the Xenia and Dashboard sections open the existing screens; they still need the admin session.
const showSettingsRows=(rows,title,help)=>{activeRows=rows;settingsTitle=title;mode='settings';selected=0;modal(title,help);renderSettings();};
const SETTINGS_HELP='Mouse/Tab: choose · Enter/A: edit/select · Esc/B: return to the dashboard';
const DASHBOARD_ENTRIES={
  'xenia:system':()=>openXenia(null),
  'xenia:profiles':async()=>{entryMode='profiles';await openXenia(null);if(xeniaView){xeniaPath={kind:'category',id:'profiles'};renderXeniaItems();}},
  'xenia:games':()=>renderGameList(),
  'xenia:updates':()=>openUpdates(),
  'xenia:advanced':async()=>{entryMode='advanced';await openXenia(null);if(xeniaView)renderXeniaAdvanced();},
  'xenia:locations':()=>openRoms(),
  'dashboard:themes':()=>renderThemes(),
  'dashboard:wizard':()=>startWizard(true),
  'dashboard:sound':()=>renderSound(),
  'dashboard:covers':()=>openCoverManager({game:null,leave:returnSettings}),
  'dashboard:security':async()=>{settings=await api.getSecurity();settings.new_pin='';showSettingsRows(SECURITY_ROWS,'PIN and locks',SETTINGS_HELP);}
};
function enterFromDashboard(name,onEntered){
  if(name==='dashboard:exit')return openExitDialog();
  const go=DASHBOARD_ENTRIES[name];if(!go||busy)return;
  gameTarget=null;entryAfterUnlock=onEntered?async()=>{onEntered();return go();}:go;unlockSection=name.split(':')[0];openPin();
}
// Xbox-style windows in the middle of the screen: the Guide, the exit confirmation and every choice menu.
function showDialog({title,text,buttons:choices,focus=0,onFocus,onCancel}){
  const returnMode=mode==='dialog'?(dialog?.returnMode??'library'):mode;
  mode='dialog';dialog={choices,focus,returnMode,onFocus,onCancel};window.uiSounds?.play('open');
  const box=document.getElementById('guide-dialog');box.classList.remove('hidden');
  document.getElementById('guide-title').textContent=title;document.getElementById('guide-text').textContent=text;
  renderDialog();
  if(!reducedMotion())box.firstElementChild?.animate?.([{opacity:0,transform:'scale(.92)'},{opacity:1,transform:'scale(1)'}],{duration:200,easing:'cubic-bezier(.2,.75,.25,1)'});
}
function renderDialog(){
  const list=document.getElementById('guide-buttons');list.replaceChildren();let selectedButton=null;
  dialog.choices.forEach((choice,index)=>{const button=node('button',index===dialog.focus?'selected':'',choice.label);button.addEventListener('click',()=>{dialog.focus=index;dialogInput('a');});list.append(button);if(index===dialog.focus)selectedButton=button;});
  selectedButton?.scrollIntoView?.({block:'nearest'});
}
function closeDialog(sound=true){const back=dialog?.returnMode??'library';if(sound)window.uiSounds?.play('back');document.getElementById('guide-dialog').classList.add('hidden');dialog=null;mode=back;}
function dialogInput(action){
  if(!dialog)return;
  if(action==='b'){const cancel=dialog.onCancel;closeDialog();return cancel?.();}
  if(action==='a'){const choice=dialog.choices[dialog.focus];window.uiSounds?.play('select');closeDialog(false);return choice.run?.();}
  const delta={left:-1,up:-1,right:1,down:1}[action];if(delta===undefined)return;
  const next=Math.max(0,Math.min(dialog.choices.length-1,dialog.focus+delta));
  if(next!==dialog.focus){dialog.focus=next;window.uiSounds?.play('focus');renderDialog();dialog.onFocus?.(dialog.choices[next]);}
}
// Alt+F4 / window close while a PIN guards the Dashboard: show the same exit window (leaving any open screen first).
function handleCloseRequest(){if(mode==='dialog')return;if(wizardRun?.active){if(mode==='wizard-view')askSkipSetup();return;}if(mode!=='library')closeModal();openExitDialog();}
// Anything with a set of choices opens this window with every option listed (the current one marked ✓
// and highlighted). ←/→ stay as a quick way to step through the values; A / Enter always opens the list.
// onFocus(value) runs as the cursor moves over an option (a live preview); onCancel() when B closes the menu without choosing.
function openChoice({title,text='',options,current,onPick,onFocus,onCancel}){
  const focus=Math.max(0,options.findIndex(option=>option.value===current));
  showDialog({title,text,focus,onCancel,onFocus:choice=>onFocus?.(choice.value),buttons:options.map(option=>({label:`${option.value===current?'✓ ':''}${option.label}`,value:option.value,run:()=>onPick(option.value)}))});
}
const ON_OFF=[{value:true,label:'On'},{value:false,label:'Off'}];
const firstSentence=text=>String(text||'').split('\n')[0].slice(0,170);
// The Guide (SELECT, the Guide button or Esc): jump to any section, or leave. The jumps come from the
// section registry, so a new section appears here by itself. Exit asks again before anything closes.
const canOpenGuide=()=>!busy&&!wizardRun?.active&&!['dialog','keyboard','pin'].includes(mode);
// Every section has its own slide sound, the pitch rising from the first to the last (a view with fewer sounds repeats its last one).
const slideSound=index=>`slide${Math.min(Math.max(index,0),3)+1}`;
function jumpToSection(id){
  if(discView)returnToLibrary();
  const ids=sections.ids(),from=ids.indexOf(nav.section),to=ids.indexOf(id);
  if(to<0||to===from)return;
  nav.focusSection(id);window.uiSounds?.play(slideSound(to));renderCarousel(to>from?'down':'up');
}
function goToProfiles(){
  jumpToSection('xenia');
  const index=sections.get('xenia').items().findIndex(item=>item.id==='profiles');
  if(index>=0){nav.setIndex('xenia',index);updateCarouselPositions();}
  enterFromDashboard('xenia:profiles');
}
function openGuide(){
  if(!canOpenGuide())return;
  if(mode!=='library')closeModal();
  const here=nav.section;
  // B closes the menu, so there is no Resume entry; it opens on the current section, where A just closes it.
  showDialog({title:'Xenia Dashboard',text:'What would you like to do?',focus:Math.max(0,sections.ids().indexOf(here)),buttons:[
    ...sections.list().map(section=>({label:`${section.id===here?'✓ ':''}${section.label}`,run:()=>jumpToSection(section.id)})),
    {label:'Profiles',run:goToProfiles},
    {label:'Exit to desktop',run:openExitDialog}
  ]});
}
function openExitDialog(){
  if(busy||mode!=='library')return;
  showDialog({title:'Exit Xenia Dashboard?',text:'Xenia Dashboard will close and you will return to the desktop.',focus:0,buttons:[
    {label:'Cancel'},
    {label:'Exit to desktop',run:()=>{gameTarget=null;unlockSection='dashboard';entryAfterUnlock=async()=>{try{await api.exitToDesktop();}catch(error){errorDisplay.textContent=error.message;}};openPin();}}
  ]});
}
// Game menu › Optimized settings: ajustes da comunidade para este jogo, mostrados antes de aplicar.
let optimizedView=null;
async function openOptimized(){
  busy=true;errorDisplay.textContent='Looking for community settings…';
  try{optimizedView=await api.checkOptimized(gameTarget.game.id);renderOptimized();errorDisplay.textContent='';}
  catch(error){errorDisplay.textContent=error.message;}finally{busy=false;}
}
function optimizedRows(){return optimizedView?.available&&optimizedView.changes.length?[{action:'apply',label:`Apply ${optimizedView.changes.length} setting${optimizedView.changes.length===1?'':'s'}`},{action:'return',label:'Return to game options'}]:[{action:'return',label:'Return to game options'}];}
function renderOptimized(index=0){
  mode='optimized';const rows=optimizedRows();selected=Math.min(index,rows.length-1);
  modal(`${gameTarget.game.title} · Optimized settings`,'D-pad: choose · A: select · B: return');content.replaceChildren();
  buttons(rows.map(row=>row.label),'settings',activate);
  const list=content.firstElementChild;list.prepend(node('div','settings-highlight'));
  const shell=node('div','settings-shell'),details=node('div','settings-details');
  details.append(node('div','detail-label'),node('div','setting-value'),node('p','setting-description'));
  shell.append(list,details);content.append(shell);updateOptimizedDetails();
}
const optimizedValue=value=>typeof value==='string'?`"${value}"`:String(value);
function updateOptimizedDetails(){
  const value=content.querySelector('.setting-value');if(!value||!optimizedView)return;
  const view=optimizedView,lines=[];
  content.querySelector('.detail-label').textContent='Community settings';
  if(!view.available){value.textContent='None for this game yet';lines.push('The community has not published settings for this game. You can still adjust it yourself under Game settings.');}
  else{
    value.textContent=view.changes.length?`${view.changes.length} change${view.changes.length===1?'':'s'} for this game${view.modified?` · updated ${view.modified}`:''}`:'Nothing to change: this game already has them';
    for(const change of view.changes)lines.push(`${change.name}: ${optimizedValue(change.from)} → ${optimizedValue(change.to)}${change.note?`\n   ${change.note}`:''}`);
    if(view.unchanged)lines.push(`\n${view.unchanged} more already set.`);
    if(view.skipped.length)lines.push(`\nSkipped (this Xenia cannot take them): ${view.skipped.map(item=>item.key).join(', ')}`);
    if(view.changes.length)lines.push('\nOnly this game changes. X on a setting in Game settings puts it back to the system value.');
  }
  content.querySelector('.setting-description').textContent=lines.join('\n');
  const button=selectableButtons()[selected],bar=content.querySelector('.settings-highlight');
  if(button&&bar){bar.style.height=`${button.offsetHeight}px`;bar.style.transform=`translateY(${button.offsetTop}px)`;}
}
async function activateOptimized(){
  const row=optimizedRows()[selected];if(!row)return;
  if(row.action==='return')return backToGameSettings();
  busy=true;errorDisplay.textContent='Applying…';
  try{const result=await api.applyOptimized(gameTarget.game.id);optimizedView=await api.checkOptimized(gameTarget.game.id);renderOptimized(0);errorDisplay.textContent=`Applied ${result.applied} setting${result.applied===1?'':'s'} to this game.`;}
  catch(error){errorDisplay.textContent=error.message;}finally{busy=false;}
}
// Game menu › DLC and updates: packages found in the ROM folder can be copied into Xenia's content folder.
let contentView=null;
async function openContent(){
  busy=true;errorDisplay.textContent='Looking for DLC and updates…';
  try{contentView=await api.checkContent(gameTarget.game.id);renderContent();errorDisplay.textContent='';}
  catch(error){errorDisplay.textContent=error.message;}finally{busy=false;}
}
function contentRows(){
  const rows=contentView.available.map(item=>({action:item.installed?'done':'install',item,label:`${item.installed?'✓ Installed':'Install'}: ${item.label} · ${item.display_name||item.name}`}));
  return [...rows,{action:'return',label:'Return to game options'}];
}
function renderContent(index=0){
  mode='content';const rows=contentRows();selected=Math.min(index,rows.length-1);
  modal(`${gameTarget.game.title} · DLC and updates`,'D-pad: choose · A: select · B: return');content.replaceChildren();
  buttons(rows.map(row=>row.label),'settings',activate);
  const list=content.firstElementChild;list.prepend(node('div','settings-highlight'));
  const shell=node('div','settings-shell'),details=node('div','settings-details');
  details.append(node('div','detail-label'),node('div','setting-value'),node('p','setting-description'));
  shell.append(list,details);content.append(shell);updateContentDetails();
}
function updateContentDetails(){
  const value=content.querySelector('.setting-value');if(!value||!contentView)return;
  const view=contentView,row=contentRows()[selected],lines=[];
  content.querySelector('.detail-label').textContent='DLC and updates';
  const waiting=view.available.filter(item=>!item.installed).length;
  value.textContent=row?.item?`${row.item.label} · ${megabytes(row.item.size)}${row.item.installed?' · already installed':''}`:waiting?`${waiting} to install`:'Nothing to install';
  if(row?.item)lines.push(row.item.installed?`${row.item.name}\nAlready in Xenia's content folder for this game.`:`${row.item.name}\nCopied unchanged into Xenia's shared content folder for this game.`);
  else if(!view.available.length)lines.push('No DLC or title update packages for this game were found in your ROM folder. Put them there and open this screen again.');
  if(view.installed.length){lines.push('\nAlready in Xenia:');for(const item of view.installed)lines.push(`${item.label}: ${item.display_name||item.name}`);}
  content.querySelector('.setting-description').textContent=lines.join('\n');
  const button=selectableButtons()[selected],bar=content.querySelector('.settings-highlight');
  if(button&&bar){bar.style.height=`${button.offsetHeight}px`;bar.style.transform=`translateY(${button.offsetTop}px)`;}
}
async function activateContent(){
  const row=contentRows()[selected];if(!row)return;
  if(row.action==='return')return backToGameMenu('content');
  if(row.action==='done'){errorDisplay.textContent='Already installed.';return;}
  busy=true;errorDisplay.textContent='Copying…';
  try{const result=await api.installContent(gameTarget.game.id,row.item.path);contentView=result;renderContent(0);errorDisplay.textContent=`Installed ${result.done.label}: ${result.done.name}.`;}
  catch(error){errorDisplay.textContent=error.message;}finally{busy=false;}
}
// Xenia Settings › Updates: install or update Xenia itself, one channel at a time. Nothing downloads until the
// user presses A on Install/Update; "use" is a separate step so an existing Xenia is never replaced silently.
const megabytes=bytes=>`${(bytes/1048576).toFixed(1)} MB`;
// Xenia Settings › Folders: where your games are, where the dashboard keeps Xenia, and Xenia's own content folder.
// ROM folders save at once; the library is rescanned on the way out.
let romFolders=[],exeGames=[],romsChanged=false,foldersInfo={};
const romRows=()=>[{action:'add',label:'Choose ROM folders…'},...(romFolders.length?[{action:'remove',label:'Remove a ROM folder…'}]:[]),{action:'add-exe',label:'Add game executables…'},...(exeGames.length?[{action:'remove-exe',label:'Remove a game executable…'}]:[]),{action:'install',label:'Xenia install folder…'},{action:'content',label:'Xenia content folder…'},{action:'return',label:backLabel()}];
async function loadFolders(){foldersInfo=await api.getSettings();romFolders=[...foldersInfo.rom_directories];exeGames=[...(foldersInfo.exe_games||[])];}
async function openRoms(){
  busy=true;try{await loadFolders();romsChanged=false;renderRoms();}catch(error){errorDisplay.textContent=error.message;}finally{busy=false;}
}
function renderRoms(index=0){
  mode='roms';const rows=romRows();selected=Math.min(index,rows.length-1);
  modal('Folders','D-pad: choose · A: select · B: return to the dashboard');content.replaceChildren();
  buttons(rows.map(row=>row.label),'settings',activate);
  const list=content.firstElementChild;list.prepend(node('div','settings-highlight'));
  const shell=node('div','settings-shell'),details=node('div','settings-details');
  details.append(node('div','detail-label'),node('div','setting-value'),node('p','setting-description'));
  shell.append(list,details);content.append(shell);updateRomsDetails();
}
function updateRomsDetails(){
  const value=content.querySelector('.setting-value');if(!value)return;
  const action=romRows()[selected]?.action,label=content.querySelector('.detail-label'),text=content.querySelector('.setting-description');
  if(action==='install'){
    label.textContent='Xenia install folder';value.textContent=foldersInfo.install_root||'';
    text.textContent=`Where Xenia Dashboard keeps the Xenia it downloads (${foldersInfo.install_is_default?'the default':'chosen by you'}). Builds already installed move with it.`;
  }else if(action==='content'){
    label.textContent='Xenia content folder';value.textContent=foldersInfo.content_root||'Not available yet';
    text.textContent=foldersInfo.content_root?'Xenia\'s own content folder: saves, DLC and title updates. Changing it only changes Xenia\'s setting; what is in the old folder stays there.':'Install or choose a Xenia and start any game once, then this folder can be changed here.';
  }else if(action==='add-exe'||action==='remove-exe'){
    label.textContent='Game executables';value.textContent=`${exeGames.length} selected`;
    text.textContent=exeGames.length?`${exeGames.join('\n')}\n\nOnly executables selected here are added to the library. Xbox game files continue to be found in ROM folders.`:'Choose individual .exe games to add. Other executables in ROM folders are ignored.';
  }else{
    label.textContent='ROM folders';value.textContent=romFolders.length?`${romFolders.length} folder${romFolders.length===1?'':'s'}`:'None yet';
    text.textContent=romFolders.length?`${romFolders.join('\n')}\n\nGames in every folder (and the folders inside them) appear in the library. The library refreshes when you leave this screen.`:'Choose the folders where your Xbox 360 games are. You can pick more than one.';
  }
  const button=selectableButtons()[selected],bar=content.querySelector('.settings-highlight');
  if(button&&bar){bar.style.height=`${button.offsetHeight}px`;bar.style.transform=`translateY(${button.offsetTop}px)`;}
}
async function leaveRoms(){
  if(busy)return;
  if(!romsChanged)return returnSettings();
  busy=true;errorDisplay.textContent='Updating the library…';
  try{await api.rescanRoms();const library=await api.getLibrary();gamesList=library.games;hiddenGamesList=library.hidden_games||[];renderCarousel();status('Library refreshed.');closeModal();}catch(error){errorDisplay.textContent=error.message;}finally{busy=false;}
}
async function activateRoms(){
  const row=romRows()[selected];if(!row)return;
  if(row.action==='return')return leaveRoms();
  const run=async work=>{busy=true;try{const before=JSON.stringify([romFolders,exeGames]);await work();await loadFolders();romsChanged=romsChanged||JSON.stringify([romFolders,exeGames])!==before;renderRoms(selected);}catch(error){errorDisplay.textContent=error.message;}finally{busy=false;}};
  if(row.action==='add')return run(()=>api.addRomFolders());
  if(row.action==='remove')return openChoice({title:'Remove a ROM folder',text:'The games stay on disk; they just leave the library.',options:romFolders.map(folder=>({value:folder,label:folder})),current:null,onPick:folder=>run(()=>api.removeRomFolder(folder))});
  if(row.action==='add-exe')return run(()=>api.addExeGames());
  if(row.action==='remove-exe')return openChoice({title:'Remove a game executable',text:'This only removes the game from the library; the file stays on disk.',options:exeGames.map(file=>({value:file,label:file})),current:null,onPick:file=>run(()=>api.removeExeGame(file))});
  if(row.action==='install')return openChoice({title:'Xenia install folder',text:`Xenia is stored in ${foldersInfo.install_root}. Builds already installed move with it.`,options:[{value:'choose',label:'Choose a folder…'},...(foldersInfo.install_is_default?[]:[{value:'default',label:'Back to the default folder'}]),{value:'',label:'Keep it where it is'}],current:'',onPick:value=>value?run(()=>api.updatesFolder(value)):undefined});
  if(row.action==='content')return openChoice({title:'Xenia content folder',text:foldersInfo.content_root?`Xenia keeps saves, DLC and updates in ${foldersInfo.content_root}. Changing it does not move what is there.`:'Xenia has no config yet: start any game once first.',options:[{value:'choose',label:'Choose a folder…'},{value:'default',label:'Back to Xenia\'s default'},{value:'',label:'Keep it where it is'}],current:'',onPick:value=>value?run(()=>api.contentFolder(value)):undefined});
}
const updatesChannelsInUse=()=>updatesView.channels.some(channel=>channel.in_use);
const updatesChannelInfo=()=>updatesView.channels.find(channel=>channel.id===updatesChannel)||updatesView.channels[0];
function updatesRows(){
  const channel=updatesChannelInfo(),latest=updatesLatest[channel.id],rows=[];
  if(updatesView.channels.length>1)rows.push({action:'channel',label:`Channel: ${channel.label}`});
  if(!channel.supported)return [...rows,{action:'return',label:backLabel()}];
  // The screen checks for a newer build whenever it opens or the channel changes, so there is no Check button: one row under the
  // channel says where things stand (A on "Up to date" or on a failed check just checks again).
  const installed=!!channel.installed;
  // Your own copy of Xenia (not installed by the dashboard) that is already the latest build needs nothing.
  const ownLatest=!installed&&latest?.tag&&latest.current_tag===latest.tag;
  if(latest==='checking')rows.push({action:'wait',label:'Checking for updates…'});
  else if(latest?.error)rows.push({action:'check',label:'Could not check · try again'});
  else if(ownLatest||(latest?.tag&&installed&&channel.installed.tag===latest.tag))rows.push({action:'current',label:'Up to date ✓'});
  else if(!installed)rows.push({action:'install',label:latest?.tag?`Install ${latest.tag}`:`Install ${channel.label}`});
  else if(latest?.tag)rows.push({action:'install',label:`Update to ${latest.tag}`});
  else rows.push({action:'check',label:'Check for updates'});
  if(channel.installed&&!channel.in_use)rows.push({action:'use',label:'Use it in Xenia Dashboard'});
  if(channel.previous)rows.push({action:'rollback',label:`Go back to ${channel.previous.tag}`});
  rows.push({action:'own',label:'Use my own Xenia…'});
  rows.push({action:'return',label:backLabel()});
  return rows;
}
async function openUpdates(){
  busy=true;try{updatesView=await api.getUpdates();updatesLatest={};updatesChannel=defaultUpdatesChannel();renderUpdates();}catch(error){errorDisplay.textContent=error.message;return;}finally{busy=false;}
  return checkUpdates();
}
function defaultUpdatesChannel(){const using=updatesView.channels.find(channel=>channel.in_use);return (using||updatesView.channels.find(channel=>channel.supported)||updatesView.channels[0]).id;}
function renderUpdates(index=0){
  mode='updates';const rows=updatesRows();selected=Math.min(index,rows.length-1);
  modal('Updates','D-pad: choose · A: select · B: return to the dashboard');content.replaceChildren();
  buttons(rows.map(row=>row.label),'settings',activate);
  const list=content.firstElementChild;list.prepend(node('div','settings-highlight'));
  const shell=node('div','settings-shell'),details=node('div','settings-details');
  details.append(node('div','detail-label'),node('div','setting-value'),node('p','setting-description'));
  shell.append(list,details);content.append(shell);updateUpdatesDetails();
}
function updateUpdatesDetails(){
  const value=content.querySelector('.setting-value');if(!value||!updatesView)return;
  const channel=updatesChannelInfo(),latest=updatesLatest[channel.id],lines=[];
  content.querySelector('.detail-label').textContent=channel.label;
  if(!channel.supported)value.textContent=`${channel.label} has no build for this system`;
  else value.textContent=channel.installed?`Installed ${channel.installed.tag} (${channel.installed.published_at||'unknown date'})${channel.in_use?' · in use':''}`:'Not installed by Xenia Dashboard';
  if(channel.supported){
    if(latest==='checking')lines.push('Checking GitHub for the latest build…');
    else if(latest?.error)lines.push(`Could not check: ${latest.error}`);
    else if(latest?.tag)lines.push(`Latest: ${latest.tag} (${latest.published_at}) · ${megabytes(latest.asset.size)}`,latest.notes?`\n${latest.notes}`:'');
    else lines.push('Press A on the first row to check for the latest build.');
    // Say what the dashboard launches today, and which official build that is when it can be told.
    if(updatesView.configured&&!channel.in_use){
      const known=latest&&typeof latest==='object'&&!latest.error&&latest!=='checking';
      const build=!known?'':latest.current_tag?` (official build ${latest.current_tag}${latest.current_tag===latest.tag?', the latest':''})`:' (version not recognised: older than the recent builds, or not an official one)';
      lines.push(`\nYour current Xenia: ${updatesView.configured}${build}`);
    }else if(!updatesView.configured)lines.push('\nNo Xenia is set up yet.');
    if(channel.executable)lines.push(`\nInstalled copy: ${channel.executable}`);
    lines.push(`\nInstall folder: ${updatesView.install_root} (change it in Xenia Settings › Folders)`);
    lines.push(updatesView.configured&&!updatesChannelsInUse()?'\nYou are using a Xenia of your own. The dashboard never changes it: to get updates, install one here and choose Use it in Xenia Dashboard (you can go back to yours with Use my own Xenia…).':'');
  }
  content.querySelector('.setting-description').textContent=lines.filter(Boolean).join('\n');
  const button=selectableButtons()[selected],bar=content.querySelector('.settings-highlight');
  if(button&&bar){bar.style.height=`${button.offsetHeight}px`;bar.style.transform=`translateY(${button.offsetTop}px)`;}
}
async function checkUpdates(){
  const channel=updatesChannelInfo();if(!channel?.supported)return;
  updatesLatest[channel.id]='checking';if(mode==='updates')renderUpdates(selected);
  try{updatesLatest[channel.id]=await api.checkUpdate(channel.id);}catch(error){updatesLatest[channel.id]={error:error.message};}
  if(mode==='updates')renderUpdates(selected);
}
async function activateUpdate(){
  const row=updatesRows()[selected],channel=updatesChannelInfo(),index=selected;if(!row)return;
  const run=async(work,done)=>{busy=true;try{updatesView=await work();xeniaReady=!!updatesView.configured;if(done)done();renderUpdates(index);}catch(error){errorDisplay.textContent=error.message;}finally{busy=false;}};
  if(row.action==='return')return returnSettings();
  if(row.action==='wait')return;
  if(row.action==='check'||row.action==='current')return checkUpdates();
  if(row.action==='channel')return openChoice({title:'Channel',options:updatesView.channels.map(item=>({value:item.id,label:`${item.label}${item.supported?'':' (not available on this system)'}${item.in_use?' · in use':''}`})),current:channel.id,onPick:value=>{updatesChannel=value;renderUpdates(0);checkUpdates();}});
  if(row.action==='install'){
    errorDisplay.textContent='Downloading…';const before=updatesView.configured;
    return run(()=>api.installUpdate(channel.id),()=>{
      const fresh=updatesChannelInfo();
      // An existing Xenia keeps being used unless the user says otherwise.
      const asksToSwitch=fresh.installed&&!fresh.in_use&&before;
      if(!asksToSwitch)explainFirstRun();
      if(asksToSwitch)setTimeout(()=>openChoice({title:'Use the new version?',text:'Xenia Dashboard currently launches another Xenia. Switch to the one just installed?',options:[{value:false,label:'Keep my current Xenia'},{value:true,label:`Use ${fresh.label} ${fresh.installed.tag}`}],current:false,onPick:value=>value?run(()=>api.useUpdate(fresh.id)):undefined}),0);
    }).then(()=>{if(!errorDisplay.textContent.startsWith('Could'))errorDisplay.textContent=errorDisplay.textContent.startsWith('Downloading')?'Installed.':errorDisplay.textContent;});
  }
  if(row.action==='own')return run(()=>api.chooseOwnXenia(),()=>{errorDisplay.textContent='Xenia Dashboard now launches the Xenia you chose.';});
  if(row.action==='use')return run(()=>api.useUpdate(channel.id),()=>{errorDisplay.textContent='Xenia Dashboard now launches this version.';});
  if(row.action==='rollback')return run(()=>api.rollbackUpdate(channel.id),()=>{errorDisplay.textContent='Went back to the earlier version.';});
}
// A Xenia that has never run has no settings file, and Profiles and Advanced need it: say so once, right after installing it.
const FIRST_RUN_TEXT='To change Profiles or Advanced settings, Xenia has to run at least once: that is when it creates the configuration files the dashboard needs. Start any game, close it, and they will be there.';
function explainFirstRun(){
  if(!updatesView?.configured||updatesView.config_ready)return;
  setTimeout(()=>showDialog({title:'Start Xenia once',text:FIRST_RUN_TEXT,buttons:[{label:'OK',run:()=>{}}],onCancel:()=>{}}),0);
}
function openGameOptions(focused){
  const game=discView?discView.game:focused||displayedGames()[nav.index('library')];if(busy||!game)return;
  gameTarget={game,fromLibrary:true};entryAfterUnlock=null;unlockSection='xenia';openPin();
}
// X on a game: straight to that game's Xenia settings; B goes back to the library.
function openGameSettings(focused){
  const game=discView?discView.game:focused||displayedGames()[nav.index('library')];if(busy||!game)return;
  if(!game.title_id){status('This game has no title ID, so Xenia cannot match settings to it.');return;}
  gameTarget={game,fromLibrary:true};unlockSection='xenia';entryAfterUnlock=()=>{entryMode='game-settings';return openXenia(game.id);};openPin();
}
// Library input: the navigator turns a button into an effect, the section decides what it means.
function libraryInput(action){
  if(discView&&nav.axis!=='grid'&&(nav.axis==='horizontal'?['left','right']:['up','down']).includes(action))return; // choose a disc, or leave with B, before changing section
  const effect=nav.dispatch(action,{stay:!!discView}),section=sections.get(nav.section);if(!effect)return;
  const item=section.items()[nav.index(section.id)];
  if(effect.type==='section'){window.uiSounds?.play(slideSound(sections.ids().indexOf(effect.to)));renderCarousel(effect.direction);}
  else if(effect.type==='move'){updateCarouselPositions(true);window.uiSounds?.play(effect.delta<0?'left':'right');}
  else if(effect.type==='activate'&&item)section.activate?.(item);
  else if(effect.type==='menu'&&item)section.menu?.(item);
  else if(effect.type==='alt'&&item)section.alt?.(item);
  else if(effect.type==='back')section.back?.();
}
// The boot animation: a video of the Xbox start-up screens, full screen, once per start. Any button skips it.
let bootTimer=0,bootOn=false;
function endBoot(){
  const screen=document.getElementById('boot-screen');clearTimeout(bootTimer);bootOn=false;
  screen?.querySelector?.('video')?.pause?.();screen?.remove?.();
  window.uiMusic?.resumeDashboard();
  uiNotices.start();
  maybeStartWizard();
}
// Which video plays: the one of the view in use, a chosen view's, or none.
function bootVideo(state){
  const choice=state?.boot_animation||'theme';if(choice==='off')return null;
  return (bootById(choice)||bootById(skin.boot))?.video||null;
}
function playBoot(state){
  const screen=document.getElementById('boot-screen');
  const source=bootVideo(state);
  if(!screen||!state||!source)return endBoot();
  const video=document.createElement('video');video.src=source;video.autoplay=true;video.playsInline=true;
  video.volume=state.sound?.effects===false?0:Math.min(1,(state.audio?.volume ?? .5)*1.4); // the boot sound counts as a sound effect
  video.addEventListener('ended',endBoot,{once:true});video.addEventListener('error',endBoot,{once:true});
  screen.append(video);bootOn=true;bootTimer=setTimeout(endBoot,20000);
  video.play?.()?.catch?.(endBoot);
}
const booting=()=>bootOn;
function input(action) {
  if(booting())return endBoot();
  if(busy)return;
  if(mode==='dialog')return dialogInput(action);
  if(mode==='wizard-view'||mode==='views'){viewPicker?.input(action);return;}
  if(mode==='library')return libraryInput(action);
  if(mode==='sound'&&(action==='left'||action==='right')&&themeRows[selected]?.key==='notice')return stepNotice(action==='left'?-.5:.5);
  if(mode==='xenia-items'&&(action==='left'||action==='right'))return adjustXenia(action==='left'?-1:1);
  if(mode==='xenia-items'&&action==='x')return resetXenia();
  if(mode==='game-info'&&(action==='up'||action==='down')){content.querySelector('.game-details')?.scrollBy({top:action==='up'?-90:90,behavior:'smooth'});return;}
  if(action==='b'){window.uiSounds?.play('back');if(mode==='keyboard')cancelEdit();else if(xeniaBack())return;else if(mode==='themes'||mode==='sound')returnSettings();else if(mode==='roms')leaveRoms();else closeModal();return;}
  if(action==='a')return activate();
  if(action==='x'){if(mode==='pin'){window.uiSounds?.play('left');pin=pin.slice(0,-1);renderPin();}else if(mode==='keyboard'){editText=editText.slice(0,-1);renderKeyboard();}return;}
  if(action==='y'){if(mode==='pin')submitPin();else if(mode==='keyboard')finishEdit();return;}
  const count=selectableButtons().length, columns=mode==='pin'?3:mode==='keyboard'?10:1;
  const delta={left:-1,right:1,up:-columns,down:columns}[action];if(delta!==undefined){const previous=selected;selected=Math.max(0,Math.min(count-1,selected+delta));highlight(selected!==previous,delta<0?'left':'right');selectableButtons()[selected]?.scrollIntoView({block:'nearest'});}
}
class GamepadWheelController {
  constructor(){this.deadzone=.35;this.repeatDelay=220;this.lastInputTime=0;this.deleteStartedAt=null;this.lastDeleteTime=0;this.buttonStates={};this.controller=null;this.direction='';this.poll=this.poll.bind(this);requestAnimationFrame(this.poll);}
  poll(timestamp){
    const gp=[...(navigator.getGamepads?.() || [])].find(g=>g?.connected && g.mapping==='standard');
    document.getElementById('controller-status').textContent=gp?'Xbox controller connected':'Connect a standard Xbox controller and press a button';
    if(gp){if(this.controller!==gp.index){this.controller=gp.index;this.buttonStates={};gp.buttons.forEach((b,i)=>this.buttonStates[i]=b.pressed);this.direction='';}this.handleInput(gp,timestamp);}
    else{this.controller=null;this.buttonStates={};this.direction='';}requestAnimationFrame(this.poll);
  }
  handleInput(gp,timestamp){
    const pressed=i=>!!gp.buttons[i]?.pressed, edge=i=>pressed(i)&&!this.buttonStates[i];
    const chord=pressed(4)&&pressed(5); // LB + RB together
    if(chord&&!this.chord)testNotice();
    this.chord=chord;
    if(edge(8)||edge(16))openGuide();
    else{
      const axisX=gp.axes[0] || 0,axisY=gp.axes[1] || 0;
      const direction=chord?'':pressed(14)||axisX < -this.deadzone?'left':pressed(15)||axisX>this.deadzone?'right':pressed(12)||axisY < -this.deadzone?'up':pressed(13)||axisY>this.deadzone?'down':mode==='library'&&pressed(4)?'lb':mode==='library'&&pressed(5)?'rb':mode==='library'&&pressed(6)?'lt':mode==='library'&&pressed(7)?'rt':'';
      if(direction && (direction!==this.direction || timestamp-this.lastInputTime>this.repeatDelay)){input(direction);this.lastInputTime=timestamp;}this.direction=direction;
      for(const [i,action] of [[0,'a'],[1,'b'],[2,'x'],[3,'y']]) {
        if(i===2&&mode==='keyboard') {
          if(edge(i)){input(action);this.deleteStartedAt=timestamp;this.lastDeleteTime=timestamp;}
          else if(pressed(i)&&this.deleteStartedAt!==null&&timestamp-this.deleteStartedAt>=400&&timestamp-this.lastDeleteTime>=80){input(action);this.lastDeleteTime=timestamp;}
          else if(!pressed(i))this.deleteStartedAt=null;
        } else if(edge(i)) input(action);
      }
      if(mode!=='keyboard')this.deleteStartedAt=null;
    }
    gp.buttons.forEach((b,i)=>this.buttonStates[i]=b.pressed);
  }
}
// Keyboard access is useful to administrators and provides an accessibility fallback.
window.addEventListener('keydown',event=>{
  if(busy)return;
  if(event.ctrlKey||event.metaKey||event.altKey)return;
  if(mode==='keyboard' && event.target?.tagName==='INPUT'){
    if(event.key==='Enter'){event.preventDefault();finishEdit();}
    else if(event.key==='Escape'){event.preventDefault();cancelEdit();}
    return; // Keep native selection, cursor movement, paste and Tab behavior.
  }
  if(mode==='pin'&&event.key==='Enter'){event.preventDefault();submitPin();return;}
  if(event.key==='Tab')return;
  if(event.key==='Enter' && event.target?.tagName==='BUTTON')return; // Native button activation.
  if(mode==='pin'&&/^\d$/.test(event.key)){if(pin.length<8){window.uiSounds?.play('right');pin+=event.key;}renderPin();return;}
  if(mode==='keyboard'&&event.key.length===1){if(editText.length<editTextLimit())editText+=event.key;renderKeyboard();return;}
  if(event.key==='Escape'&&mode==='library'&&!discView){event.preventDefault();openGuide();return;}
  const action={ArrowLeft:'left',ArrowRight:'right',ArrowUp:'up',ArrowDown:'down',a:'left',A:'left',d:'right',D:'right',w:'up',W:'up',s:'down',S:'down',PageUp:'lt',PageDown:'rt',q:'lt',Q:'lt',e:'rt',E:'rt',Enter:'a',Backspace:'x',x:'x',X:'x',y:'y',Y:'y',Escape:'b'}[event.key];if(action){event.preventDefault();input(action);}
});
// ---- The install wizard (first run, or Dashboard Settings › Install Wizard) ----
const wizardStage=document.getElementById('wizard-stage');
let wizardRun=null,wizardRerun=false,wizardChosen=false,wizardPending=false;
const showStage=on=>wizardStage.classList.toggle('hidden',!on);
const wizardStrip=()=>{const p=wizardRun.progress();return `Setup · step ${p.step} of ${p.of}`;};
function wizardView(){
  mode='wizard-view';showStage(true);
  const host=node('div','wz-host');
  wizardStage.replaceChildren(node('h1','wz-title','Choose how your dashboard looks'),node('p','wz-sub','Four dashboards from the Xbox 360 years, oldest first. You can change it later in Dashboard Settings › View.'),host,node('p','wz-help','← → browse · A choose · B back'));
  viewPicker=NXE.createViewPicker({document,host,views:NXE.viewsFromRegistry(NXE.skins),current:wizardRerun||wizardChosen?skin.name:null,
    onChoose:chooseWizardView,onBack:askSkipSetup});
}
async function chooseWizardView(name){
  if(busy)return;busy=true;
  try{applyTheme(await api.setSkin(name));wizardChosen=true;showStage(false);mode='library';}
  catch(error){status(error.message);busy=false;return;}
  busy=false;window.uiSounds?.play('select');wizardRun.next();
}
function askSkipSetup(){
  showDialog({title:'Skip setup?',text:'You can run the Install Wizard again from Dashboard Settings.',
    buttons:[{label:'Continue setup',run:wizardView},{label:'Skip setup',run:()=>wizardRun.skipAll()}],onCancel:wizardView});
}
function wizardCard({title,text,primary,onPrimary}){
  showDialog({title,text:`${wizardStrip()} — ${text}`,
    buttons:[{label:primary,run:onPrimary},{label:'Skip this step',run:()=>wizardRun.next()},{label:'Skip setup',run:()=>wizardRun.skipAll()}],
    onCancel:()=>wizardRun.back()});
}
const WIZARD_STEPS=[
  {id:'view',enter:()=>wizardView()},
  {id:'xenia',enter:()=>wizardCard({title:'Set up Xenia',text:xeniaReady?'Xenia is set up. You can change it or keep it.':'Install Xenia, or choose a copy you already have.',
    primary:xeniaReady?'Change Xenia':'Install or choose Xenia',onPrimary:()=>enterFromDashboard('xenia:updates',()=>wizardRun?.open())})},
  {id:'folders',enter:()=>wizardCard({title:'Choose your game folders',text:'Pick the folders where your games are. The library is read when you leave the screen.',
    primary:'Choose game folders',onPrimary:()=>enterFromDashboard('xenia:locations',()=>wizardRun?.open())})},
  {id:'covers',when:()=>gamesList.length>0,enter:()=>wizardCard({title:'Download covers',text:`${gamesList.length} games found. Download their covers now? It all happens here: the data first (about 105 MB, once), then a cover for each game.`,
    primary:'Download covers',onPrimary:wizardCovers})}
];
// The covers step does the whole job without leaving the wizard: the source's data if it has none yet, then the covers of the
// games that have none. Progress shows on the card; when it ends the card offers Continue (or Try again).
async function wizardCovers(){
  if(busy)return;busy=true;
  const card=(title,text,buttons)=>showDialog({title,text:`${wizardStrip()} — ${text}`,buttons,onCancel:()=>{}});
  wizardCoverNote=text=>{const box=document.getElementById('guide-text');if(box)box.textContent=`${wizardStrip()} — ${text}`;};
  try{
    const info=AUTO_MODES.find(m=>m.value===cm.mode)||AUTO_MODES[0],sources=await api.coverSources();
    for(const id of info.needs){
      const source=sources.find(s=>s.id===id);if(!source||!coverNeedsData(source))continue;
      card('Downloading covers',`Downloading ${source.label} data…`,[{label:'Please wait…',run:()=>{}}]);await api.prepareCoverSource(id);
    }
    card('Downloading covers','Downloading covers…',[{label:'Please wait…',run:()=>{}}]);
    const result=await api.autoCovers(cm.mode,false);gamesList=result.games;renderCarousel();
    wizardCoverNote=null;busy=false;
    card('Covers',`${result.downloaded} cover${result.downloaded===1?'':'s'} downloaded${result.missing?` · ${result.missing} not found`:''}.`,[{label:'Continue',run:()=>wizardRun.next()}]);
  }catch(error){
    wizardCoverNote=null;busy=false;
    card('Covers could not be downloaded',error.message,[{label:'Try again',run:wizardCovers},{label:'Skip this step',run:()=>wizardRun.next()}]);
  }
}
async function endWizard(){
  showStage(false);mode='library';
  try{await api.wizardEnd();}catch(error){status(error.message);}
  if(wizardRerun)api.lockAdmin().catch(()=>{});
  wizardRun=null;
  try{const library=await api.getLibrary();gamesList=library.games;hiddenGamesList=library.hidden_games||[];xeniaReady=library.xenia_ready!==false;}catch{/* the library stays as it was */}
  showSectionColumn();renderCarousel();
}
async function startWizard(rerun=false){
  wizardRerun=rerun;wizardChosen=false;
  try{await api.wizardBegin();}catch(error){status(error.message);return;}
  document.body.classList.remove('modal-open');document.getElementById('overlay').classList.add('hidden');
  wizardRun=NXE.createWizard({steps:WIZARD_STEPS,onEnd:endWizard});wizardRun.start();
}
// The wizard waits for the boot animation; the page asks again when it ends.
function maybeStartWizard(){if(wizardPending&&!booting()){wizardPending=false;startWizard(false);}}
window.addEventListener('resize',updateCarouselPositions);
window.addEventListener('DOMContentLoaded',async()=>{
  document.getElementById('close-admin').addEventListener('click',()=>{if(!busy)closeModal();});
  if(!api){endBoot();status('Start with npm run start to enable the native launcher.');renderCarousel();return;}
  api.onCloseRequest?.(handleCloseRequest);
  api.onNotice?.(notice=>uiNotices.post(notice));
  api.onWindowMode?.(windowMode=>{themeState={...themeState,window_mode:windowMode};if(mode==='themes')renderThemes();});
  api.onCoverProgress?.(coverProgress);
  api.onContentProgress?.(progress=>{if(mode==='content'&&busy&&progress.total)errorDisplay.textContent=`Copying… ${Math.floor(progress.received/progress.total*100)}%`;});
  api.onUpdateProgress?.(progress=>{if(mode==='updates'&&busy&&progress.total)errorDisplay.textContent=`Downloading… ${Math.floor(progress.received/progress.total*100)}%`;});
  api.onGameState(state=>{busy=state.running;if(state.running)window.uiMusic?.stopForGame();else{launchScreen(false);window.uiMusic?.resumeDashboard();}status(state.error || (state.running?'Game running…':''));});
  if(window.uiMusic)window.uiMusic.suspended=true; // the boot video has its own sound; the music starts after it
  let bootState=null;
  try{bootState=await api.getTheme();applyTheme(bootState);}catch(error){status(`Theme unavailable: ${error.message}`);}
  playBoot(bootState);
  try{for(const notice of await api.takeNotices())uiNotices.post(notice);}catch{/* no notices is fine */}
  try{const library=await api.getLibrary();gamesList=library.games;hiddenGamesList=library.hidden_games||[];xeniaReady=library.xenia_ready!==false;cm.mode=library.auto_cover_source||'launchbox';status(library.error);renderCarousel();}catch(error){status(error.message);renderCarousel();}
  try{wizardPending=!!(await api.wizardState()).first_run;}catch{/* an old main process: no wizard */}
  maybeStartWizard();
  new GamepadWheelController();
});
