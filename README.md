# Segatt Tools

Native Windows tuning app for gamers and PC enthusiasts. Zero telemetry.

[Download](https://github.com/joshsegatt/Segatt-Tools/releases/latest) · [MIT license](LICENSE)

A Tauri + Rust + Next.js desktop app. Type what you want in one search box and it finds the action: a gaming preset, a single tweak, an app to install, a cleanup or a repair. Every task reports its real result, and nothing leaves your PC.

## Features

- **Search everything** — one composer on the Home screen finds presets, tweaks, apps, cleanup tasks and repairs, in Portuguese or English.
- **Apps** — install and remove apps through winget.
- **Tweaks** — privacy, performance, interface and system tweaks, with presets (gaming, privacy, essentials) and a restore point first.
- **Cleaner** — temp files, update caches, shader caches, recycle bin, Windows.old.
- **Fixes** — SFC, DISM, network reset, Windows Update reset, icon cache, classic control panels.
- **Private** — no telemetry, no account, no cloud calls.

## Stack

- Desktop — Tauri 2, Rust
- UI — Next.js 16, React 19, TypeScript

## Install

**Release build (recommended)**

1. Get the `.msi` or `.exe` from [Releases](https://github.com/joshsegatt/Segatt-Tools/releases/latest).
2. Windows SmartScreen may warn on a new publisher — *More info → Run anyway*.
3. Open **Segatt Tools** from the Start menu.

**From source**

```bash
# Node 22.6+ (tests run TypeScript natively), Rust stable, Tauri CLI
git clone https://github.com/joshsegatt/Segatt-Tools.git
cd Segatt-Tools
npm install
npm run tauri build
```

Signing keys are not in this repo. For a signed local build set:

```
TAURI_SIGNING_PRIVATE_KEY=
TAURI_SIGNING_PRIVATE_KEY_PASSWORD=
```

## License

[MIT](LICENSE) © Josh Segatt
