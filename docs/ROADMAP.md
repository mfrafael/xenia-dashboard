# Xenia Dashboard roadmap — "configure Xenia like a real Xbox 360"

Goal: everything the Xenia Edge GUI offers, reachable from Xenia Dashboard with a controller, in the
dashboard's own style. Xenia stays the engine; Xenia Dashboard edits its files and launches it.

Facts this plan is built on (Xenia Edge on Linux, 2026-10-13):

- Global config: `<storage>/xenia-edge.config.toml` (Canary: `xenia-canary.config.toml`).
  `<storage>` = folder of the executable when `portable.txt` sits next to it, otherwise
  `~/.local/share/Xenia` (Linux) or `Documents\Xenia` (Windows).
- Format: flat `[Section]` + `key = value  # comment`, 312 keys in 24 sections, values are
  bool/int/float/string only. Enums are documented as `Use: [a, b]`, ranges as `Value range: [a-b]`.
- Per-game overrides: `<storage>/config/<TITLEID>.config.toml` (same format, only changed keys).
- Edge's own library: `<storage>/library/<TITLEID>/<version>/game.toml` (+ `icon.png`)
  maps title ID ↔ ROM path.
- Patches: `<storage>/patches/<TITLEID> - <name>.patch.toml`, toggled through `is_enabled`.
- Xenia may rewrite its config while running → it never writes while a game runs.

## Phases

| # | Phase | Status |
|---|-------|--------|
| 0 | Native Linux emulators (Edge AppImage launches directly, Wine only for `.exe`) | done |
| 1 | Config engine: parse, describe and edit Xenia TOML without losing comments/unknown keys; locate the config | done |
| 2 | Title IDs: read them from ISO (XDVDFS), XEX and GOD/STFS; reuse Edge's library | done |
| 3 | Covers by title ID: exact x360db box art, "download all" in one pass, no fuzzy guessing | done |
| 4 | System Settings: Xbox-style categories (Display, Graphics, Audio, Controller, Console/Region, Storage, Linux) + Advanced (every key) | done |
| 5 | Per-game settings: same editor scoped to one game, shows overrides, "reset to system value" | done |
| 6 | Patches: list, enable/disable, download the title's patch file from xenia-canary/game-patches | done |
| 7 | Game info: title ID, media ID, installed title updates/DLC, Edge icon | done |
| 8 | Profiles and achievements: gamertags (decrypted Account), who signs in per player slot, per-game achievements from GPD files; creating profiles stays in Xenia | done |
| 9 | Linux AppImage build of the app itself (`npm run build:linux`, verified packaged module list) | done |

The status column is updated as each phase lands; some checks still
need a human with a controller and a real game.

## Rules kept from upstream

- Renderer stays sandboxed; every new IPC is admin-only and validated in the main process.
- Writes are atomic (exclusive temp + rename); the first write keeps a one-time
  `.nxe-backup` copy of the original Xenia file.
- Only known keys from the parsed file can be edited, with the type of the existing value.

## Dashboard restructure (replaces the separate Admin panel)

Goal: ↑/↓ switches between vertical sections like the real NXE (Game Library, Xenia, Dashboard…);
each section is a horizontal row; A enters a screen. See `ARCHITECTURE.md`.

| # | Phase | Status |
|---|-------|--------|
| D1 | Three layers (sections / navigation / skin); Game Library runs through them, no visible change | done |
| D2 | Section column: ↑/↓ between Game Library, Xenia and Dashboard; the skin stacks the section names; tiles open the existing screens and B returns to the dashboard | done |
| D3 | Admin screens live in the sections (Locations and PIN-and-locks are their own tiles); per-section PIN lock enforced in the main process; B returns to the dashboard; X opens a game's settings; up/down wraps | done |
| D4 | Old Admin panel and button removed; Locations moved to Xenia; SELECT opens an Xbox-style exit confirmation | done |

## Backlog

- **Achievements** (asked 2026-10-14): they already show in a game's *Game details* (per-game list read from the
  profile's GPD files, phase 8), but the owner wants to give them proper attention. Scope still to be defined with
  him (for example: an Xbox-style achievements screen of their own, gamerscore, the "achievement unlocked" toast).

## Next release

- **Achievements:** a proper experience (see Backlog above): an Xbox-style achievements screen, gamerscore, and the "achievement unlocked" toast.
- **Family mode / PIN:** improvements. Both are experimental today (per-section locks, PIN session, kiosk limits).

## Done

- **Games that run by themselves** (1.3.0): recomps and PC ports (`.exe`, `.AppImage` on Linux; since 1.5.0 any file on Linux, `.bat`/`.cmd`/`.lnk` on Windows) next to the Xenia games; named and given a LaunchBox cover (any platform) when added, never blocked; *Run with* Wine/Proton on Linux. Built on @hernjon's first version.
- **Windowed mode and a smoother first run** (1.1.0): fullscreen or windowed (*View › Window*, Alt+Enter), WASD and Q/E on the keyboard, a one-step cover download in the Install Wizard, a pop-up that says what to do when Xenia is not set up or has not run yet, and a cleaner Updates screen.
- **Install wizard and View picker** (1.0.0): a neutral first-run timeline to choose the view, then Xenia, ROM folders and covers in the chosen view; the same picker is *Dashboard Settings › View*, and the wizard re-runs from *Dashboard Settings › Install Wizard*. The name of a dashboard style is now "View" everywhere the user reads.
