# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

Desktop app for Windows 10/11: a Tauri 2 window (WebView2) rendering a Next.js static export, with a Rust backend that runs privileged system tasks. It is used only on Windows desktops at desktop window sizes; there is no mobile surface.

## Users

Primary: gamers and PC enthusiasts tuning **their own** Windows PC. They want more FPS and lower latency, less telemetry and bloat, and control over what runs. They understand what a registry tweak or a service is, and they want to see exactly what a change does and be able to undo it.

## Product Purpose

One native app to tune, clean, repair and equip a Windows PC: install and update apps through winget, apply and revert system tweaks, clean disk junk, run repair tools and control Windows features and updates.

Success: the user trusts the app enough to run it on their main machine. Every action reports its real result, every tweak shows the real state of the system and can be reverted, and nothing leaves the device.

## Positioning

The reference competitor is Chris Titus Tech's WinUtil (PowerShell + WPF script, 239 apps, 69 tweaks, revertible registry tweaks, update modes, features, MicroWin ISO builder). Segatt Tools competes as a **native app** instead of a downloaded script:

- shows the live state of each tweak and reverts it to the original value;
- runs everything elevated once, with progress and results inside the app instead of popping console windows;
- cleaning and repair tools beyond what WinUtil offers;
- one exportable profile (apps + tweaks + settings) to set up a new PC in one step;
- no telemetry, no account, works offline (winget downloads excepted).

## Operating Context

- Runs elevated (release builds request administrator through the app manifest; debug builds run as the current user).
- Typical sessions: right after a fresh Windows install, after a big Windows update, before a gaming session, or when the PC feels slow.
- Depends on Windows tools: winget, PowerShell 5.1, reg.exe, bcdedit, DISM/SFC, powercfg.
- Changes are real and system-wide; a restore point is offered before batches of tweaks or cleanup.

## Capabilities and Constraints

- Areas: Dashboard (health and admin state), Apps (catalog + winget search, install/uninstall/upgrade), Tweaks (privacy, performance, interface, system), Cleaner, Fixes (SFC, DISM, network, Windows Update, icon cache, legacy panels), Control (Windows Update modes and Windows features).
- Planned (approved 2026-11-21): tweak engine with detect/apply/revert, installed-app detection and "update all", real Windows Update modes and features, profile export/import.
- Languages: 10, with the Windows display language as default and English as fallback: English, Portuguese (Brazil), Spanish, French, German, Russian, Chinese (Simplified), Japanese, Korean, Turkish. Every string must exist in every language; no mixed-language screens.
- Local AI: the existing on-device chat (WebLLM/Ollama) is not wired into any screen. Decision 2026-11-21: remove it from the interface; revisit an optional Ollama integration later.
- Out of scope for now: a custom Windows ISO builder (MicroWin equivalent).
- **Product name: Segatt Lab** (decided 2026-11-22, was "Segatt Tools"). The lab fits the mascot, keeps the surname and the S-G-T initials. The mascot, a pixel-art scientist in orange goggles holding a chip, is the logo and app icon (face at small sizes) and carries the playful side; the name stays calm because the app runs as administrator. Data names stay as they were (`com.segatt.tools`, the `segatt-tools-profile` format) so nothing saved breaks. The name lives in `src/lib/brand.ts` and `tauri.conf.json`.

## Brand Commitments

- Owner and publisher: Josh Segatt ("Segatt Soft" appears as publisher in the installer).
- The labels "Elite", "RE-ELITE" and "Matrix" used in older versions are not part of the brand going forward.
- Quality bar set by the owner: the finish of Apple's own apps.
- **Visual reference, pinned by the owner (2026-11-21):** the modern AI desktop apps — Microsoft Copilot, the ChatGPT app and Google Antigravity. The app should sit alongside them at their craft level. The owner rejected game-manual, Braun/desk-object, Metro-tile, ticket-wallet and Windows-Settings directions.

## Evidence on Hand

- MIT-licensed source on GitHub (joshsegatt/Segatt-Tools), public releases since v1.0.1; latest v1.7.8.
- No user testimonials, download milestones, benchmarks or FPS gains have been measured. Do not state performance numbers or user counts in the product.

## Product Principles

1. **Honest by default.** Show the real state and the real result; a failure is shown as a failure, never as success.
2. **Every change is reversible or explicitly warned.** Revert to the original value where possible; anything that cannot be undone says so before it runs.
3. **Power without fear.** Expert users see exactly what changes (keys, services, commands) without being slowed down by it.
4. **Local and private.** No telemetry, no account, no cloud calls for core features.
5. **One app, whole PC.** Replace the scattered scripts and panels a user would otherwise run by hand.

## Accessibility & Inclusion

- Full keyboard operation of every list, toggle and action.
- Text must fit the longest of the 10 languages (German, Russian) without clipping; CJK fonts must render.
- Respect reduced-motion and Windows contrast settings.
