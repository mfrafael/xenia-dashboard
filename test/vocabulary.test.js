'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');

// "View" is the user's word for a whole dashboard style (Blades, NXE, Kinect, Metro). "look" as a noun for that is gone;
// the verb ("how it looks", "looks like", "look at") is fine.
const FILES = [
  'README.md', 'docs/ARCHITECTURE.md', 'docs/NXE-ASSETS.md',
  'index.html', 'sections/settings.js', 'ui/renderer.js', 'ui/notice.js', 'ui/ui-sounds.js', 'ui/covers-ui.js', 'ui/updates-ui.js', 'ui/notice.css', 'ui/wizard.js', 'ui/wizard.css', 'ui/view-picker.js',
  'src/main.js', 'src/nxe.js', 'dashboard/skin.js', 'dashboard/navigation.js', 'dashboard/sections.js',
  'skins/blades/blades-skin.js', 'skins/nxe/nxe-skin.js', 'skins/kinect/kinect-skin.js', 'skins/metro-v1/metro-v1-skin.js'
];
const VERB = /\b(looks? like|looks? at|looks? up|looks again|looks and moves|how (it|the dashboard) looks|dashboard looks|download looks|a screen looks)\b/gi;

test('no user-visible text or documentation calls a dashboard style a "look"', () => {
  const found = [];
  for (const file of FILES) {
    fs.readFileSync(path.join(root, file), 'utf8').split('\n').forEach((line, index) => {
      if (/\blooks?\b/i.test(line.replace(VERB, ''))) found.push(`${file}:${index + 1}: ${line.trim().slice(0, 110)}`);
    });
  }
  assert.deepEqual(found, [], 'say "view" instead of "look" in:\n' + found.join('\n'));
});

test('the error for an unknown view says view', () => {
  assert.match(fs.readFileSync(path.join(root, 'src/main.js'), 'utf8'), /Error\('Invalid view'\)/);
});
