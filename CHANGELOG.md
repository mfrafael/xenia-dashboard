# Changelog

All notable changes to Xenia Dashboard. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the
versions follow [Semantic Versioning](https://semver.org/).

## [1.5.0] - 2026-10-31

### Added
- **Any launcher for a game that runs by itself.** On Linux, *Add games…* takes `.sh` scripts and, with *All files*, any other file. On Windows it takes `.bat`, `.cmd` and `.lnk` shortcuts too.
- A `.sh` without a `#!` line now runs through `sh` instead of failing.

### Minor changes
- The file picker is named "Games and launchers" and lists the supported types.

## [1.4.0] - 2026-10-25

Updates for the dashboard and for Xenia.

### Added
- **Updates menu.** *Dashboard Settings › Updates* sets the dashboard and Xenia, each on its own, to **Notify only** (the default) or **Automatic**. The app checks when it starts, and stays quiet when offline.
- **Update from the app.** *Update to…* downloads, closes, installs and reopens. **Automatic** installs when you close the app and says "updated to X" the next time you open it.
- Setup and AppImage update themselves. The Portable build only notifies and opens the release page.

### Minor changes
- Installing a Xenia now blocks launching a game until it finishes.
- The Linux AppImage is now just `Xenia-Dashboard.AppImage` (no version in the name), so updates replace it in place and shortcuts keep working.
- Changing other settings no longer waits for an update download to finish.
- A shipped build is not code-signed: updates are checked against the checksum of the GitHub release.
- The first version with this menu is installed by hand once.

## [1.3.0] - 2026-10-24

Recomps and PC ports in the library, building on [@hernjon](https://github.com/hernjon)'s work. Thank you!

### Added
- **Recomps and PC ports.** *Folders › Add games…* adds `.exe` files (and `.AppImage` on Linux), each with its name and a LaunchBox cover. They launch without Xenia.
- **Run with** (Linux): pick Wine, Proton or GE-Proton for a Windows game in its *Game settings*.

### Fixed
- `.zar` games are found in ROM folders (#3).

### Minor changes
- *Remove from library* in a recomp's menu.
- LaunchBox data now covers every platform; download it again once.

## [1.2.0] - 2026-10-19

Manual cover search and hidden games, contributed by [@hernjon](https://github.com/hernjon) (#2). Thank you!

### Added
- **Manual cover search.** *Change cover › LaunchBox › Search LaunchBox for…* lets you search by another game name, to fix or replace a cover.
- **Hide games.** *Hide game* in a game's menu keeps it out of the library; *Xenia Settings › Games* shows it again.
- Holding X on the controller keyboard keeps erasing.

### Minor changes
- **Blades:** the Folders and PIN and locks icons were larger than the others.

## [1.1.0] - 2026-10-18

Windowed mode, improved keyboard support, and an enhanced Install Wizard.

### Added
- **Windowed mode.** *Dashboard Settings › View › Window* switches the dashboard between fullscreen (the console way) and a
  normal window with a title bar. The **Alt + Enter** shortcut does the same.
- **Keyboard like the gamepad.** **W A S D** move like the arrow keys, and **Q / E** switch sections like LT / RT
  (**Enter** is A and **Esc** is B, as before).
- **Install Wizard › Covers.** Covers are now downloaded automatically with one click, with no need to update the cover
  sources beforehand.

### Fixed
- **Xenia first-run windows.** Before changing Xenia's Profiles or Advanced settings, Xenia has to be opened at least once.
  The app now tells you when that is required, and offers to set up Xenia if none is configured.

### Minor changes
- **Game covers:** options reordered.
- **Xenia Settings › Updates:** checks for updates automatically.
- **View timeline:** the circles of the view picker were not aligned with the line (the focused one pushed the name down).
  They now sit on the line, the focused one larger and centred, with the names at the same height.

## [1.0.0] - 2026-10-15

The first release: a controller-first, Xbox 360-style dashboard that also configures the Xenia emulator.

- **Four views** of the console's dashboard through the years — Blades (2005), NXE (2008), Kinect (2010) and Metro (2011) — with
  the native sounds, start-up videos and wallpapers, and a timeline **View picker**.
- **Install Wizard** on the first run: view, Xenia, ROM folders and covers, each skippable, in the chosen view.
- **Xenia, configured like a real Xbox 360**: install and update Xenia (Edge, Canary), every Xenia setting (system and per game),
  community-optimized settings, patches, DLC and title updates, profiles and storage.
- **Game library** with portrait covers (LaunchBox, the Xenia Manager database or your own images), game details, achievements and
  profiles.
- **PIN protection and family mode** are opt-in (experimental), with a lock per section.
- Windows installer and portable build, and a Linux AppImage; the portable builds keep everything in one folder next to them.
