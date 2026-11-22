# Code signing policy

## Status

Segatt Lab is applying to the [SignPath Foundation](https://signpath.org/) open-source program. Once approved, Windows releases will use:

> Free code signing provided by [SignPath.io](https://signpath.io/), certificate by [SignPath Foundation](https://signpath.org/).

Until then, Windows releases are not Authenticode-signed. Every release still carries the SHA-256 that GitHub publishes (the [install script](install.ps1) checks it) and an updater signature that the app verifies before it installs an update.

## What gets signed

Only files built from this repository:

- `Segatt Lab` application executable (`app.exe`)
- the Windows installers (`Segatt.Lab_<version>_x64-setup.exe` and `Segatt.Lab_<version>_x64_en-US.msi`)

No third-party binary is signed as Segatt Lab. Components that ship with Windows (WebView2, winget, PowerShell) keep their own Microsoft signatures.

## Source and build

- Source: [joshsegatt/Segatt-Lab](https://github.com/joshsegatt/Segatt-Lab), MIT license, no proprietary components.
- Releases: [GitHub Releases](https://github.com/joshsegatt/Segatt-Lab/releases).
- Signed artifacts are built by GitHub Actions from this public repository, from a tagged commit on `main`.
- Every production signing request is approved by hand by the approver below.

## Roles

Segatt Lab is maintained by one person.

- Committer and reviewer: [joshsegatt](https://github.com/joshsegatt)
- Signing approver: [joshsegatt](https://github.com/joshsegatt)

Outside contributions come through pull requests and are reviewed before merge. Changes to the release workflow, this policy or the signing configuration are reviewed by the maintainer. Multi-factor authentication is required on GitHub and SignPath for everyone with these roles.

## Privacy

This program will not transfer any information to other networked systems unless specifically requested by the user or the person installing or operating it, with one exception: it asks GitHub Releases whether a newer version exists. That request carries no information about the PC or the person. Apps are downloaded by winget only when the person asks for them. Hardware details, settings and logs stay on the PC.

## Key protection and incidents

The maintainers never receive or store the SignPath Foundation private key; signing happens inside SignPath.io under the approved project policy.

If a signed file, the release workflow, a maintainer account or a signing request is suspected to be compromised, signing and publishing stop, the issue is investigated, SignPath Foundation is notified and revocation of the affected signatures is requested. Report security issues privately through [GitHub security advisories](https://github.com/joshsegatt/Segatt-Lab/security/advisories/new).
