'use strict';
// Advanced is always the last tile of a section.
// Sections that replace the old Admin panel. Each tile opens one of the existing screens through
// ctx.enter(name); what a screen looks like is not decided here.
(function (root) {
  const caption = (label, items, index) => ({
    title: items[index]?.title || label, heading: label, subtitle: items[index]?.hint || 'Press A to open',
    counter: items.length ? `${index + 1} of ${items.length}` : '', empty: false
  });
  const tile = (id, title, hint, icon = 'settings') => ({ id, title, hint, icon, art: null, badge: null });
  function registerSettingsSections(registry, ctx) {
    registry.register({
      id: 'xenia', label: 'Xenia Settings', kind: 'tiles', order: 20,
      items: () => [
        tile('system', 'System', 'Console, display, graphics, audio and controllers', 'console'),
        tile('locations', 'Folders', 'The folders where your games are', 'folder'),
        tile('updates', 'Updates', 'Install and update Xenia', 'download'),
        tile('profiles', 'Profiles', 'Who is signed in for each player', 'profiles'),
        tile('games', 'Games', 'Settings, patches and details for one game', 'games'),
        tile('advanced', 'Advanced', 'Every Xenia setting, with Xenia\'s own descriptions', 'more')
      ],
      caption: (items, index) => caption('Xenia Settings', items, index),
      activate: item => ctx.enter(`xenia:${item.id}`)
    });
    registry.register({
      id: 'dashboard', label: 'Dashboard Settings', kind: 'tiles', order: 30,
      items: () => [
        tile('updates', 'Updates', 'The dashboard and Xenia: notify or update by themselves', 'download'),
        tile('themes', 'View', 'Its view and wallpaper', 'themes'),
        tile('sound', 'Sound and animations', 'Volume, music, sound effects and the boot animation', 'sound'),
        tile('covers', 'Game covers', 'Download, replace and rescan artwork', 'camera'),
        tile('security', 'PIN and locks', 'PIN protection and which sections ask for it', 'family'),
        tile('wizard', 'Install Wizard', 'Set up the view, Xenia, your folders and covers again', 'settings'),
        tile('exit', 'Exit to desktop', 'Close Xenia Dashboard', 'desktop')
      ],
      caption: (items, index) => caption('Dashboard Settings', items, index),
      activate: item => ctx.enter(`dashboard:${item.id}`)
    });
  }
  root.NXE = root.NXE || {};
  root.NXE.registerSettingsSections = registerSettingsSections;
  if (typeof module !== 'undefined') module.exports = { registerSettingsSections };
})(typeof window !== 'undefined' ? window : globalThis);
