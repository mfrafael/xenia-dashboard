'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('electronAPI', {
  getLibrary: () => ipcRenderer.invoke('library:get'),
  getTheme: () => ipcRenderer.invoke('theme:get'),
  getAdminAccess: section => ipcRenderer.invoke('admin:access', section ?? null),
  setPinProtection: required => ipcRenderer.invoke('admin:pin-protection',required),
  selectTheme: id => ipcRenderer.invoke('admin:theme-select',id),
  setSkin: name => ipcRenderer.invoke('admin:skin', name),
  wizardState: () => ipcRenderer.invoke('wizard:state'),
  wizardBegin: () => ipcRenderer.invoke('wizard:begin'),
  wizardEnd: () => ipcRenderer.invoke('wizard:end'),
  setAnimations: mode => ipcRenderer.invoke('admin:animations',mode),
  takeNotices: () => ipcRenderer.invoke('notices:take'),
  onNotice: callback => { const listener = (_event, notice) => callback(notice); ipcRenderer.on('notice', listener); return () => ipcRenderer.removeListener('notice', listener); },
  setSound: (kind, value) => ipcRenderer.invoke('admin:sound', kind, value),
  setWindowMode: mode => ipcRenderer.invoke('admin:window-mode', mode),
  onWindowMode: callback => { const listener = (_event, mode) => callback(mode); ipcRenderer.on('window:mode', listener); return () => ipcRenderer.removeListener('window:mode', listener); },
  setBootAnimation: choice => ipcRenderer.invoke('admin:boot-animation', choice),
  launchXeniaGame: id => ipcRenderer.invoke('game:launch', id),
  setGameHidden: (id, hidden) => ipcRenderer.invoke('xenia:game-hidden', id, hidden),
  unlockAdmin: (pin, section) => ipcRenderer.invoke('admin:unlock', pin, section ?? null),
  getSecurity: () => ipcRenderer.invoke('admin:security'),
  setPin: pin => ipcRenderer.invoke('admin:set-pin', pin),
  setSectionLock: (section, locked) => ipcRenderer.invoke('admin:section-lock', section, locked),
  lockAdmin: () => ipcRenderer.invoke('admin:lock'),
  getSettings: () => ipcRenderer.invoke('admin:settings'),
  addRomFolders: () => ipcRenderer.invoke('xenia:roms-add'),
  removeRomFolder: folder => ipcRenderer.invoke('xenia:roms-remove', folder),
  rescanRoms: () => ipcRenderer.invoke('xenia:roms-rescan'),
  contentFolder: action => ipcRenderer.invoke('xenia:content-folder', action),
  chooseOwnXenia: () => ipcRenderer.invoke('xenia:updates-own'),
  coverSources: () => ipcRenderer.invoke('covers:sources'),
  prepareCoverSource: source => ipcRenderer.invoke('covers:prepare', source),
  searchCovers: (gameId, source) => ipcRenderer.invoke('covers:search', gameId, source),
  coverPictures: (gameId, source, key) => ipcRenderer.invoke('covers:pictures', gameId, source, key),
  previewCover: (gameId, source, key, picture) => ipcRenderer.invoke('covers:preview', gameId, source, key, picture),
  applyCover: (gameId, source, key, picture) => ipcRenderer.invoke('covers:apply', gameId, source, key, picture),
  chooseCoverFile: gameId => ipcRenderer.invoke('covers:local', gameId),
  onCoverProgress: callback => {
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on('covers:progress', listener);
    return () => ipcRenderer.removeListener('covers:progress', listener);
  },
  rescanCovers: () => ipcRenderer.invoke('admin:cover-rescan'),
  autoCovers: (source, all) => ipcRenderer.invoke('admin:cover-auto', source, all === true),
  exitToDesktop: () => ipcRenderer.invoke('admin:exit'),
  getXeniaSettings: gameId => ipcRenderer.invoke('xenia:settings', gameId ?? null),
  setXeniaSetting: (gameId, id, value) => ipcRenderer.invoke('xenia:set', gameId ?? null, id, value),
  resetXeniaSetting: (gameId, id) => ipcRenderer.invoke('xenia:reset', gameId, id),
  getPatches: gameId => ipcRenderer.invoke('xenia:patches', gameId),
  setPatch: (gameId, name, enabled) => ipcRenderer.invoke('xenia:patch-set', gameId, name, enabled),
  downloadPatches: gameId => ipcRenderer.invoke('xenia:patch-download', gameId),
  checkOptimized: gameId => ipcRenderer.invoke('xenia:optimized-check', gameId),
  checkContent: gameId => ipcRenderer.invoke('xenia:content-check', gameId),
  installContent: (gameId, source) => ipcRenderer.invoke('xenia:content-install', gameId, source),
  onContentProgress: callback => {
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on('content:progress', listener);
    return () => ipcRenderer.removeListener('content:progress', listener);
  },
  applyOptimized: gameId => ipcRenderer.invoke('xenia:optimized-apply', gameId),
  getUpdates: () => ipcRenderer.invoke('xenia:updates-status'),
  checkUpdate: channel => ipcRenderer.invoke('xenia:updates-check', channel),
  installUpdate: channel => ipcRenderer.invoke('xenia:updates-install', channel),
  useUpdate: channel => ipcRenderer.invoke('xenia:updates-use', channel),
  updatesFolder: action => ipcRenderer.invoke('xenia:updates-folder', action),
  rollbackUpdate: channel => ipcRenderer.invoke('xenia:updates-rollback', channel),
  onUpdateProgress: callback => {
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on('updates:progress', listener);
    return () => ipcRenderer.removeListener('updates:progress', listener);
  },
  getGameInfo: gameId => ipcRenderer.invoke('xenia:game-info', gameId),
  onCloseRequest: callback => {
    const listener = () => callback();
    ipcRenderer.on('app:close-request', listener);
    return () => ipcRenderer.removeListener('app:close-request', listener);
  },
  onGameState: callback => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('game:state', listener);
    return () => ipcRenderer.removeListener('game:state', listener);
  }
});
