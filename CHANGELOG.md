# Changelog

All notable changes to Xenia Dashboard. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the
versions follow [Semantic Versioning](https://semver.org/).

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
