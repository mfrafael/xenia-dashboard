# Dashboard architecture

The dashboard is split into three layers so a new view (Blades, Metro…) never means redoing
sections or navigation. Everything is a classic script loaded by `index.html`, in this order.

| Layer | File(s) | Knows about | Does not know about |
|---|---|---|---|
| 1. **Sections** (what) | `dashboard/sections.js`, `sections/*.js` | items, captions, what A/Y/B do | drawing, animation |
| 2. **Navigation** (how focus moves) | `dashboard/navigation.js` | sections, item counts, buttons | the DOM, the skin |
| 3. **Skin** (how it looks) | `dashboard/skin.js`, `skins/<name>/*.js` | the DOM, theme art, transitions | what a section means |

`ui/renderer.js` is the app glue: state, the admin screens that have not moved into sections yet,
gamepad/keyboard input and boot.

## Section

```js
registry.register({
  id: 'library',            // lowercase id
  label: 'Game Library',
  kind: 'rail',             // 'rail' (big items) | 'tiles' (tiles that open a screen)
  order: 10,                // position in the vertical list of sections
  // alt(item) is X (a shortcut such as a game's settings); the PIN lock is NOT a section field,
  // it is enforced by the main process per section id (see Security below).
  items() { return [{ id, title, art, badge, … }]; },
  caption(items, index) { return { title, heading, subtitle, counter, empty }; },
  activate(item) {}, menu(item) {}, back() {}
});
```

## Navigator

`createNavigator({ sections, count })`: `dispatch(button)` returns an effect or `null` (nothing
happened, so no sound): `move {from,to,delta}` for ←/→/LB/RB (LB/RB jump 5), `section {from,to}`
for ↑/↓, and `activate` / `menu` / `back` for A / Y / B. Each section remembers its own focus.

## Skin contract

A skin registers with `NXE.skins.register(skin)` and must implement (checked at registration,
see `REQUIRED` in `dashboard/skin.js`): `mount`, `applyTheme`, `setMotion`, `renderRail`,
`focusRail`, `setLaunch`. `renderRail` draws a section's items from scratch; `focusRail` moves
focus and shows the caption the section produced. A skin never builds captions itself.

## Adding a section

Register it (see `sections/library.js`), nothing else: the navigator and the skin pick it up.

## Adding a skin

A skin is a folder `skins/<name>/` with a script that registers it (`NXE.skins.register`), its own stylesheet and, if it
needs one, a theme pack. Besides the seven required functions it may declare:

- `label`: the name shown under *Dashboard Settings › View*;
- `axis`: `'vertical'` (NXE: sections stacked, items sideways) or `'horizontal'` (blades: sections side by side, items
  running up and down). The navigator swaps the arrow keys accordingly; LB/RB always jump five items;
- `wrap`: `true` (default, NXE: past the last section comes the first) or `false` (blades: the ends stop);
- `stylesheet`: `skins/<name>/<file>.css`, swapped into `<link id="skin-css">` when the skin is chosen;
- `unmount()`: removes what `mount()` put in the page (the NXE skin builds its wallpaper, horizon and corner orb there;
  `index.html` only holds the shell every skin shares: header, title, counter, footer, dialogs).

Steps: copy `skins/nxe/`, change the drawing, add the script to `index.html`, `APP_FILES` in `src/local-assets.js` and
`build.files` (`dashboard.test.js` fails if you forget). The choice is saved by `admin:skin` (Dashboard section) and comes
back in `theme:get` as `skin`.

**Screen contract.** Folders, Updates, the choice window, keyboard and PIN screens are drawn by `ui/renderer.js` with fixed
class names (`#overlay`, `.panel`, `.settings`, `.settings-highlight`, `.settings-details`, `.cover-options`, `.entry`,
`.key-grid`, `.pin-grid`, `#guide-dialog`, `.guide-box`, `#status`, `#launch-overlay`). Every skin's stylesheet styles them;
the logic never changes with the view.

**Theme pack.** Each skin keeps its own pack (wallpapers, icons, sounds) and its own saved choice. `src/main.js` only knows the
provider contract in `THEME_PROVIDERS` (`key`, `load`, `view`, `config`); only views with a provider can be chosen, and a saved view
that no longer exists falls back to NXE. NXE's provider is `src/nxe.js` (the XUIZ importer is NXE-only; `parseXzp` also reads version 3 archives, the Kinect
dashboard's, whose names are single bytes).

Four skins exist: `skins/metro-v1/` (Metro, 2011; one view for every Metro dashboard, as the later ones up to 17559 only change details; grid: the lowercase pivot of section names along the top and a grid of
square green tiles two rows high, filled column by column; the navigator's `grid` axis moves ↑/↓ inside a column and
←/→ across columns, changing section past the first or last one or with LB/RB; `rows(kind)` gives the rows; game covers
keep the grid's height and take the cover's width; its screens import the Kinect stylesheet, which is what dashboard
2.0.15574 used too; its pictures in `skins/metro-v1/assets/`, its sounds are the Kinect files, identical in 15574),
`skins/kinect/` (2010, vertical: the channel names stacked above a row of white tiles with the green
swoosh, the focused tile first and full size, the others at 78% to its right; screens are a white list with a green
highlight beside a grey description panel; its own files in `skins/kinect/assets/`, taken from dashboard 2.0.13604:
the aura background and floor, the grey tile pictograms, the A/B/X/Y legends, the orb and the sounds), `skins/nxe/` (2008, vertical, from dashboard 2.0.7371 and a capture of it: the channels passed stacked above the open
one, a deck of tiles drawn with the dashboard's own slot textures and glossy pictograms, which `publicTheme` exposes as
`scene.tiles`, `scene.glossy`, `scene.menuOrb`; game covers as portrait tiles; slate menus; the orb
that floats and drops ripples; and the channel-change sound in `skins/nxe/assets/`) and `skins/blades/` (2005, horizontal: one coloured blade per section,
passed blades fold left, the rest wait as tabs on the right; the list of the open blade on the left, the focused item on
the right). Blades draws with its own files in `skins/blades/assets/` (edges, runners, swirl frames, glass, highlights,
icons, sounds, the MC360 font), placed on the original 720×576 grid of the MC360 skin's Home/GamesHome windows and
scaled to the window. From the NXE pack it only shares the saved volume.

**Skin assets and boot video.** Anything under `skins/<name>/assets/` (png, jpg, wav, ttf, webm, one sub-folder deep) is served
by the app protocol (`appFile` in `src/local-assets.js`). The startup videos are listed in `BOOTS` (`dashboard/skin.js`), named by the dashboards they belong to: `classic` (Blades / NXE, 2005-2011) and `kinect` (Kinect / Metro, 2011-2012). A skin names one with `boot` (its id); it plays once when the
dashboard opens, and any button skips it. A new view reuses the latest video until it gets its own. *Sound and animations › Boot animation* (`admin:boot-animation`) chooses what plays: `theme` (default, the view in use), `off`, or a video's id to keep it with any theme. After changing the View, if another video was picked on purpose, the app asks whether to follow the new view's (or to always follow the theme).

**Where the settings live.** *Dashboard Settings › View* is only about the view (View, and the wallpapers a view has). *Sound and animations* holds the settings of the app itself, which are saved in the library and work with every view: volume, music, sound effects (`admin:sound`), animations and the boot animation.

Section `kind`s say what the items are (`rail`, `tiles`, `list`), not how they are laid out: that is the skin's job.

## Launching a game

`launch()` in `src/main.js` starts Xbox game files through Xenia with `--fullscreen <game>` (straight into the game, no Xenia menu) and a log of its own
(`--log_file`, in the app's data folder). Standalone `.exe` games run directly, without requiring Xenia; on Linux the configured
Wine/Proton runner is used unless the runner is set to `native`. They use the same launch handoff and return to the dashboard when
the executable exits. Only `.exe` files explicitly selected in Xenia Settings › Folders are included; the scanner pairs an adjacent image with each one. The per-game cover manager supports manual LaunchBox name searches.
Xenia (Edge) does not quit when a game ends with *Return to Arcade*: it goes back to
its game list and keeps the window open. `title-exit.js` reads that log, and on `KernelState::ExitToDashboard` closes Xenia
(the whole process group on Linux, so the AppImage runtime and Wine go too) and the dashboard takes the screen back. A jump from
one title to another inside Xenia does not log that line, so it is left alone.

## Notifications

`ui/notice.js` + `ui/notice.css` draw a toast in the style of the Xbox 360's achievement pop-up (grey pill at the top right that slides in and out from the right, round icon, bold title,
one line of text) with the `notify` sound (a view without its own falls back to the "open" sound). It is shared by every view and
waits in a queue until the boot animation is over. Today it announces one thing: when the app opens, `checkXeniaUpdate()` in
`src/main.js` compares the Xenia in use with the latest GitHub release (`src/update-notice.js`, same rule as Xenia Settings › Updates:
up to date when the installed tag equals the latest one; an own copy only when it is recognised as an official build) and posts
"Xenia update available". Offline or anything unexpected says nothing. **LB + RB together** shows a test notification.

## Status

D1 (this structure), D2, D3 and D4 are done: Game Library, Xenia and Dashboard are sections (`sections/library.js`,
`sections/settings.js`) and ↑/↓ moves between them. The Xenia and Dashboard tiles open the settings screens in `ui/renderer.js`. The old Admin panel, its button and the
Start/chord shortcuts are gone.

## Navigation rules

- ↑/↓ cycle through the sections as a ring (down from the last goes to the first).
- ←/→ move inside a section, LB/RB jump 5; A activates, Y opens options, **X** is the section's shortcut
  (Game Library: that game's Xenia settings), B goes back.
- SELECT (or the Guide button; Esc on a keyboard) opens the Guide menu (`openGuide`): one jump per registered section, Profiles, Exit (B closes it); Start has no function. A window close (Alt+F4) quits directly when nothing guards the Dashboard, else it opens that window.
- A tile that jumps straight into a screen (Profiles, Advanced, a game's settings) returns to the dashboard on B.

## Interaction rule

Anything selectable among options goes through `openChoice({ title, text, options, current, onPick })` in `ui/renderer.js`, which shows the centered window (`#guide-dialog`, drawn above every screen) and returns to the screen it was opened from. A / Enter opens it; ←/→ remain a quick step; B cancels. New settings should use it instead of cycling on A.

## Install wizard and View picker

Three small units, none of them a section:

- `ui/view-picker.js` — the timeline component (`NXE.createViewPicker`, `NXE.viewsFromRegistry`). It reads each skin's `about = { name, years, blurb }` and its preview `assets/views/<skin>.jpg` (served through `VIEW_PREVIEW` in `src/local-assets.js`), so a new skin appears on the timeline by registering with an `about` and a preview. The same component is the neutral first step of the wizard and *Dashboard Settings › View*.
- `ui/wizard.js` — the step runner (`NXE.createWizard`): steps with an optional `when`, `next` / `back` / `skipAll`, and `open()` / `screenClosed()` so the screens it opens (Updates, Folders, Covers; reused through `enterFromDashboard`) hand control back from `closeModal()`.
- `src/wizard-state.js` — `isFirstRun(library)`: no `wizard_done`, no saved `skin`, no Xenia, no ROM folder. Any other install never sees the wizard unasked.

`src/main.js` keeps a `wizardSession` flag: while a first-run wizard is active, the `xenia` and `dashboard` scopes need no PIN (`pinRequiredFor`, `sessionValid`); `wizard:end` clears it and saves `wizard_done`. Run again from the unlocked Dashboard Settings, `wizard:begin` opens nothing extra. The neutral screen is `#wizard-stage` styled by `ui/wizard.css`, with no skin art or sounds.

## Security

The renderer never decides who may change things. `src/main.js` keeps admin sessions per scope: `*` (Admin button / Start,
covers everything) and one per section (`xenia`, `dashboard`), five minutes each. Every IPC names its section
(`xenia:*` and Locations need `xenia`; covers, themes, PIN, locks and exit need `dashboard`; the PIN has its own `admin:set-pin`, never part of saving Locations), so unlocking Xenia cannot reach
the Dashboard or the reverse. `locked_sections` (default both) says which sections ask for the PIN; with PIN
protection off nothing asks. There is no all-access entry in the UI any more; the `*` session in src/main.js only remains for compatibility with older callers.
