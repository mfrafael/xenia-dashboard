'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { loadDashboard } = require('./helpers/dashboard');
const vm = require('node:vm');
const path = require('node:path');

test('cover reflection retains artwork source when the tile is cloned',()=>{
  const { fakeDocument } = require('./helpers/fake-dom');
  const saved = [globalThis.document, globalThis.innerWidth, globalThis.innerHeight, globalThis.addEventListener];
  Object.assign(globalThis, { document: fakeDocument(), innerWidth: 1600, innerHeight: 900, addEventListener() {} });
  try {
    const skin = require('../skins/nxe/nxe-skin').createNxeSkin();
    skin.mount({});
    skin.renderRail({ kind: 'rail' }, [{ title: 'Game', art: 'kratos-art://cover/cover' }], 0, { title: 'Game', heading: 'Game Library', subtitle: '', counter: '1 of 1', empty: false });
    const tile = document.body.children[0].find('nv-row').children[0], [face, reflection] = tile.children;
    assert.equal(face.children[0].src, 'kratos-art://cover/cover'); assert.equal(reflection.children[0].src, face.children[0].src);
  } finally { [globalThis.document, globalThis.innerWidth, globalThis.innerHeight, globalThis.addEventListener] = saved; }
});
test('SELECT or the Guide button asks to exit; Start and the old admin chord do nothing; A triggers only on press', () => {
  const actions=[];
  const context=vm.createContext({ window:{ electronAPI:{}, addEventListener(){} }, document:{getElementById(){return {}; }}, requestAnimationFrame(){}, navigator:{} });
  loadDashboard(vm, context, '\ninput = action => actions.push(action); openGuide = () => actions.push("guide?"); openPin = () => actions.push("pin"); globalThis.engine = new GamepadWheelController();');
  context.actions=actions;
  const gp={buttons:Array.from({length:17},()=>({pressed:false})),axes:[0,0]};
  const release=()=>{gp.buttons.forEach(button=>button.pressed=false);context.engine.handleInput(gp,0);};
  gp.buttons[8].pressed=true;context.engine.handleInput(gp,1000);
  assert.deepEqual(actions,['guide?'],'SELECT opens the Guide menu');
  context.engine.handleInput(gp,1400);assert.deepEqual(actions,['guide?'],'holding it does not repeat');
  release();gp.buttons[16].pressed=true;context.engine.handleInput(gp,1500);
  assert.deepEqual(actions,['guide?','guide?'],'the Guide button does the same');
  release();gp.buttons[9].pressed=true;context.engine.handleInput(gp,1600);
  assert.deepEqual(actions,['guide?','guide?'],'Start has no function now');
  release();gp.buttons[4].pressed=gp.buttons[5].pressed=gp.buttons[12].pressed=gp.buttons[0].pressed=true;context.engine.handleInput(gp,1700);
  assert.equal(actions.includes('pin'),false,'the old LB+RB+Up+A admin chord is gone');
  release();actions.length=0;
  gp.buttons[0].pressed=true;context.engine.handleInput(gp,2000);context.engine.handleInput(gp,2300);
  assert.deepEqual(actions,['a']);
  gp.buttons[0].pressed=false;context.engine.handleInput(gp,2400);
  gp.buttons[0].pressed=true;gp.buttons[15].pressed=true;context.engine.handleInput(gp,2500);
  assert.deepEqual(actions,['a','right','a']);
});
test('holding controller X repeats delete only while editing text', () => {
  const actions=[];
  const context=vm.createContext({window:{electronAPI:{},addEventListener(){}},document:{getElementById(){return {}; }},requestAnimationFrame(){},navigator:{}});
  loadDashboard(vm,context,'\ninput=action=>actions.push(action);globalThis.engine=new GamepadWheelController();mode="keyboard";');
  context.actions=actions;
  const gp={buttons:Array.from({length:17},()=>({pressed:false})),axes:[0,0]};
  gp.buttons[2].pressed=true;context.engine.handleInput(gp,1000);
  context.engine.handleInput(gp,1300);
  assert.deepEqual(actions,['x'],'delete acts immediately and waits before repeating');
  context.engine.handleInput(gp,1400);
  context.engine.handleInput(gp,1480);
  assert.deepEqual(actions,['x','x','x'],'held delete repeats at a usable rate');
  gp.buttons[2].pressed=false;context.engine.handleInput(gp,1560);
  context.engine.handleInput(gp,1700);
  assert.deepEqual(actions,['x','x','x'],'releasing stops repeats');
  vm.runInContext('mode="covers"',context);gp.buttons[2].pressed=true;context.engine.handleInput(gp,1800);context.engine.handleInput(gp,2300);
  assert.deepEqual(actions,['x','x','x','x'],'X keeps its one-press behavior outside text editing');
});
test('native field editing preserves cursor and Tab; Enter accepts and Escape discards', () => {
  const actions=[], listeners={};
  const context=vm.createContext({ actions, window:{electronAPI:{},addEventListener(name,callback){listeners[name]=callback;}},document:{getElementById(){return {};}},requestAnimationFrame(){},navigator:{} });
  loadDashboard(vm, context, '\nmode="keyboard"; finishEdit=()=>actions.push("done"); cancelEdit=()=>actions.push("cancel"); input=action=>actions.push(action);');
  const dispatch=(key,target='INPUT',extra={})=>{let prevented=false;listeners.keydown({key,target:{tagName:target},preventDefault(){prevented=true;},...extra});return prevented;};
  assert.equal(dispatch('ArrowLeft'),false);
  assert.equal(dispatch('Tab'),false);
  assert.equal(dispatch('v','INPUT',{ctrlKey:true}),false);
  assert.deepEqual(actions,[]);
  assert.equal(dispatch('Enter'),true);
  assert.equal(dispatch('Escape'),true);
  assert.deepEqual(actions,['done','cancel']);
  assert.equal(dispatch('Enter','BUTTON'),false);
  assert.deepEqual(actions,['done','cancel']);
  vm.runInContext('mode="pin"; submitPin=()=>actions.push("submit");',context);
  assert.equal(dispatch('Enter','BODY'),true);
  assert.deepEqual(actions,['done','cancel','submit']);
});

test('PIN navigation, digit entry and erase use tile cycling cues; settings screens keep their rows in order',async()=>{
  const sounds=[];const context=vm.createContext({window:{electronAPI:{},uiSounds:{play:role=>sounds.push(role)},addEventListener(){}},document:{getElementById(){return {}; }},requestAnimationFrame(){},navigator:{}});
  loadDashboard(vm, context, '\nmode="pin";renderPin=()=>{};selectableButtons=()=>Array.from({length:12},()=>({classList:{toggle(){}},scrollIntoView(){}}));');
  vm.runInContext('input("right");input("left");activate();input("x");',context);assert.deepEqual(sounds,['right','left','right','left']);
  assert.deepEqual(Array.from(vm.runInContext('SECURITY_ROWS.map(row=>row.label)',context)),['New PIN','PIN protection','Lock Xenia Settings','Lock Dashboard Settings','Return to dashboard']);
});

test('LB and RB pressed together put up a test notification and do not jump through the list', () => {
  const actions=[],posted=[];
  const context=vm.createContext({ window:{ electronAPI:{}, addEventListener(){} }, document:{getElementById(){return {}; }}, requestAnimationFrame(){}, navigator:{} });
  loadDashboard(vm, context, '\ninput = action => actions.push(action); uiNotices.post = () => posted.push("test"); globalThis.engine = new GamepadWheelController();');
  context.actions=actions;context.posted=posted;
  const gp={buttons:Array.from({length:17},()=>({pressed:false})),axes:[0,0]};
  gp.buttons[4].pressed=true;gp.buttons[5].pressed=true;
  context.engine.handleInput(gp,1000);context.engine.handleInput(gp,1400);context.engine.handleInput(gp,1800);
  assert.deepEqual(posted,['test'],'once for the chord, however long it is held');
  assert.deepEqual(actions,[],'the chord does not count as LB or RB');
  gp.buttons[4].pressed=false;gp.buttons[5].pressed=false;context.engine.handleInput(gp,2200);
  gp.buttons[4].pressed=true;gp.buttons[5].pressed=true;context.engine.handleInput(gp,2600);
  assert.deepEqual(posted,['test','test'],'a second press shows it again');
});
