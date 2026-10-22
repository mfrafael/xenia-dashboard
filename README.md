<div align="center">

# Xenia Dashboard

**The Xbox 360 dashboard experience, rebuilt for the [Xenia](https://xenia.jp/) emulator.**
Four eras of the console's interface, the real sounds, and a library, settings and updater you drive entirely with a controller.

![Xenia Dashboard — NXE view](docs/screenshots/nxe-library.jpg)

</div>

> **Unofficial.** Not affiliated with the Xenia team or Microsoft. Supply your own Xenia and games. This is a personal, non-commercial project made for learning.

## Four eras of the Xbox 360, one app

Pick a view in *Dashboard Settings › View* and the whole dashboard changes with it: layout, motion, backgrounds and sounds, each as close to the console as it gets.

![The View picker in Dashboard Settings](docs/screenshots/settings-view.jpg)

| | |
|:--|:--|
| ![Blades](docs/screenshots/blades-library.jpg) **Blades** · 2005–2008<br>The launch dashboard: curved blades, animated background, the original blade sounds. | ![NXE](docs/screenshots/nxe-library.jpg) **NXE** · 2008–2010<br>The New Xbox Experience: cover-flow on the horizon, glossy tiles, the orb. |
| ![Kinect](docs/screenshots/kinect-library.jpg) **Kinect** · 2010–2011<br>The ribbon dashboard, with the big green tiles and the Guide orb. | ![Metro](docs/screenshots/metro-library.jpg) **Metro** · 2011–2012<br>A grid of covers under a lowercase Metro header: much of the library on one screen. |

Every view shares the same core: the same sections, the same menus, the same controller shortcuts. A view is only a skin.

## Made for the couch

- **Everything works with a gamepad.** D-pad or stick to browse, **A** to select, **B** to go back, **X** for game settings, **Y** for options, **LB / RB** to jump five games, **LT / RT** to switch section, **SELECT** for the Guide. On a keyboard the arrow keys or **W A S D** move, **Enter** is A, **Esc** is B, **Q / E** are LT / RT, and mouse and keyboard file pickers work too.
- **Fullscreen or windowed.** Fullscreen is the console way; *Dashboard Settings › View › Window* (or **Alt + Enter** anywhere) turns the dashboard into a normal window you can move and resize. It switches at once, on the same screen, and remembers the size and place of the window. It works with every view and follows the shape you give it.
- **Menus the Xbox way.** Press A on any option to open its list; ←/→ still step through values, B cancels. No repeated menus, and *Advanced* is always last.
- **The real sounds.** Blade slides, focus, select, back and the notification chime, taken from the console's own dashboards, in the right places for each era.
- **A first-run wizard.** On a new install the Install Wizard opens by itself: you pick a view on a timeline of the Xbox 360 dashboards, then set up Xenia, your game folders and the covers. Run it again any time from *Dashboard Settings › Install Wizard*.
- **Portrait covers, properly.** Box art is shown upright and with its transparency, in a carousel, a grid or a list depending on the view.

## First run

![The install wizard: choose a view](docs/screenshots/wizard-view.jpg)

The first screen is deliberately neutral, so it does not favour any era: a timeline from 2005 to 2012 with a preview of each dashboard. When you choose one, the next steps already use it.

![The install wizard: set up Xenia](docs/screenshots/wizard-xenia.jpg)

## Your library

![Game options](docs/screenshots/game-options.jpg)

- **Covers:** one manager per game or in bulk (*Download covers* / *Download missing covers*), from a local file, the Xenia Manager database or LaunchBox.
- **Standalone `.exe` games:** add individual executables from *Xenia Settings › Folders › Add game executables* (including Xbox 360 recomps); other `.exe` files in ROM folders are ignored. They launch without Xenia. Name them for clean library titles, add a same-name `.jpg`/`.png`/`.jpeg` beside them for local art, or use **Y → Change cover → LaunchBox** to search by name; title-ID metadata is not needed.
- **Game details** from x360db, with title IDs read from ISO / XEX / STFS headers, so Arcade and Games-on-Demand packages are listed too. Multi-disc games become one tile.
- **DLC and title updates** found in your ROM folder are copied unchanged into Xenia's content folder.
- **Patches:** download and toggle them by name ([game-patches](https://github.com/xenia-canary/game-patches)).
- **Community-optimized settings** per game, shown as a diff before applying ([optimized-settings](https://github.com/xenia-manager/optimized-settings)).
- **Profiles and achievements:** gamertags, who is signed in on each player slot, and the per-game achievement list read from the profile.

| | |
|:--|:--|
| ![Game details](docs/screenshots/game-details.jpg) | ![Change cover](docs/screenshots/change-cover.jpg) |

## Xenia, configured from the couch

![Xenia Settings](docs/screenshots/xenia-settings.jpg)

*Xenia Settings* holds **System**, **Folders**, **Updates**, **Profiles**, **Games** and **Advanced**.

- **Install and update Xenia** (Canary, Edge, or official on Windows) from GitHub, side by side, with a download bar. On Linux they live in `~/.local/share/xenia-dashboard/xenia`; *Folders → Xenia install folder* lets you pick another place. A copy of Xenia you point to yourself is never touched.
- **Every Xenia setting**, system-wide and per game (marked ●), grouped like a console menu, plus *Advanced* with every key. The comments in your config are preserved.

| | |
|:--|:--|
| ![System settings](docs/screenshots/system-settings.jpg) | ![Game settings](docs/screenshots/game-settings.jpg) |

## Family mode (experimental)

Each section can be locked with its own PIN, so settings and the exit button stay out of reach of small hands. It is experimental: see [Settings and kiosk limits](#settings-and-kiosk-limits).

## Every screen, in every view

Each view covers the same four screens: the library, Xenia Settings, a settings page (System › Graphics) and the Guide menu opened with SELECT over Dashboard Settings.

### Blades

| | |
|:--|:--|
| ![Blades library](docs/screenshots/blades-library.jpg) | ![Blades Xenia Settings](docs/screenshots/blades-xenia.jpg) |
| ![Blades graphics](docs/screenshots/blades-graphics.jpg) | ![Blades Guide](docs/screenshots/blades-guide.jpg) |

### NXE

| | |
|:--|:--|
| ![NXE library](docs/screenshots/nxe-library.jpg) | ![NXE Xenia Settings](docs/screenshots/nxe-xenia.jpg) |
| ![NXE graphics](docs/screenshots/nxe-graphics.jpg) | ![NXE Guide](docs/screenshots/nxe-guide.jpg) |

### Kinect

| | |
|:--|:--|
| ![Kinect library](docs/screenshots/kinect-library.jpg) | ![Kinect Xenia Settings](docs/screenshots/kinect-xenia.jpg) |
| ![Kinect graphics](docs/screenshots/kinect-graphics.jpg) | ![Kinect Guide](docs/screenshots/kinect-guide.jpg) |

### Metro

| | |
|:--|:--|
| ![Metro library](docs/screenshots/metro-library.jpg) | ![Metro Xenia Settings](docs/screenshots/metro-xenia.jpg) |
| ![Metro graphics](docs/screenshots/metro-graphics.jpg) | ![Metro Guide](docs/screenshots/metro-guide.jpg) |

## Download

Get the latest build from [**Releases**](../../releases/latest):

- **Windows:** `Xenia-Dashboard-<version>-Setup.exe` (installer) or `-Portable.exe` (no install).
- **Linux:** `Xenia-Dashboard-<version>.AppImage` — `chmod +x` it and run.

**Portable:** the `-Portable.exe` saves everything (library, settings, covers, installed Xenia) in a `Xenia Dashboard Data` folder next to it, so you can carry it on a USB stick. It does not use or change `%APPDATA%`. For the AppImage, create a folder named `Xenia Dashboard Data` beside it to get the same behaviour. Game paths are stored as typed, so on a stick whose drive letter changes, set *Folders* again (or keep the games on the stick and use the same letter).

Builds are unsigned: Windows SmartScreen will warn once ("More info › Run anyway").

## Controls and first setup

1. Connect a standard-mapped Xbox controller. D-pad/left stick browses, A selects/launches, and LB/RB jumps five games.
2. Press **↓** to **Xenia Settings** and open **Folders**.
3. Choose your ROM folders (more than one is fine; the library refreshes when you leave). Install Xenia from **Updates**, or point to your own copy there with **Use my own Xenia…** (the dashboard never updates a copy that is not its own).
4. For child or unattended use, set a PIN under **Dashboard Settings › PIN and locks › New PIN** (it saves at once). A new install asks for no PIN; the PIN is opt-in. Set a PIN of your own, then turn **PIN protection** on to lock the sections you choose.

PIN controls: D-pad chooses, A enters, X (keyboard: X or Backspace) erases, Y (keyboard: Y) submits, and B cancels. Keyboard typing, Tab/Enter/Escape, paste, and native mouse/keyboard file pickers also work.

A section's PIN session expires after five minutes and ends when returning to games or launching a game. **SELECT** opens the Guide from anywhere on the dashboard. Disabling PIN protection allows anyone to change settings and exit.

## Build from source

Node.js 22+:

```sh
git clone https://github.com/mfrafael/xenia-dashboard.git
cd xenia-dashboard
npm ci
npm start          # run
npm test           # tests
npm run build:windows   # on Windows
npm run build:linux     # on Linux
```

Releases are built by GitHub Actions when a `v*` tag is pushed (`.github/workflows/release.yml`).

## Project layout

```
src/         main process: app entry (main.js), Xenia config/releases, scanner, covers, profiles, installers
ui/          renderer glue and shared UI helpers (renderer.js, notice, sounds, music)
dashboard/   the core: sections, navigator, skin contract
sections/    Game Library, Xenia Settings, Dashboard Settings
skins/       the four views: blades, nxe, kinect, metro-v1
assets/      bundled dashboard artwork, sounds and music
test/        node:test suites, helpers and fixtures
tools/       developer tools (UI preview and screenshots)
docs/        architecture, roadmap, manual tests, asset notes
```

## Settings and kiosk limits

Settings and caches use Electron's userData folder, normally `%APPDATA%/Xenia Dashboard` or `~/.config/Xenia Dashboard`. Settings from before the rename (the `NXE` folder) are moved to the new folder on the first start. PINs are stored as salted hashes.

Fullscreen kiosk mode blocks app close/navigation/devtools controls, but OS shortcuts, task managers, compositor bindings, and physical access require account/OS restrictions. Use a limited kiosk account for child use. The launcher alone is not a security boundary.

## Credits and licenses

- **[OrthoDad38/NXE](https://github.com/OrthoDad38/NXE)** — the original launcher this project grew from.
- **[Xenia Manager](https://github.com/xenia-manager/xenia-manager)** / [x360db](https://github.com/xenia-manager/x360db) — ideas, file-format notes, game and cover database.
- **[LaunchBox Games Database](https://gamesdb.launchbox-app.com/)** — optional cover source, downloaded on demand.
- **[Xenia](https://xenia.jp/)** — the emulator.

This is a personal, non-commercial project made for learning. Source code is MIT ([LICENSE](LICENSE)). The dashboard artwork, sounds and fonts are Microsoft's, taken from the Xbox 360 dashboards, and the background music is a fan recording; they are included for personal, non-profit use only and are not covered by the MIT license. The repository is private and is not meant to be redistributed. Dashboard artwork and sounds, music, game covers and Xbox trademarks belong to their owners; see [asset attribution](assets/ATTRIBUTION.md), [dashboard resources](docs/NXE-ASSETS.md), [FFmpeg notice](FFMPEG-NOTICE.md) and [VALIDATION.md](docs/VALIDATION.md).
