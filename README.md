# My Job Finder

[![CI](https://github.com/Shudufhadzo/my-job-finder/actions/workflows/ci.yml/badge.svg)](https://github.com/Shudufhadzo/my-job-finder/actions/workflows/ci.yml)
[![Latest release](https://img.shields.io/github/v/release/Shudufhadzo/my-job-finder?display_name=tag)](https://github.com/Shudufhadzo/my-job-finder/releases/latest)
[![MIT license](https://img.shields.io/badge/license-MIT-16715d.svg)](LICENSE)

My Job Finder is a local-first desktop application that turns one master CV into a daily, organised job-search workspace. It discovers roles for the positions and locations you select, ranks each role against your CV, and prepares a tailored CV and cover letter as styled PDF files.

## Download

| Platform | Installer |
| --- | --- |
| Windows 10/11, x64 | [Download `MyJobFinder-Setup.exe`](https://github.com/Shudufhadzo/my-job-finder/releases/latest/download/MyJobFinder-Setup.exe) |
| macOS 13+, Apple Silicon | [Download `MyJobFinder-macOS-arm64.dmg`](https://github.com/Shudufhadzo/my-job-finder/releases/latest/download/MyJobFinder-macOS-arm64.dmg) |
| macOS 13+, Intel | [Download `MyJobFinder-macOS-x64.dmg`](https://github.com/Shudufhadzo/my-job-finder/releases/latest/download/MyJobFinder-macOS-x64.dmg) |

Release checksums are published as `SHA256SUMS.txt` beside the installers.

> **Unsigned preview:** Version 0.1.2 is an open-source preview and is not yet backed by commercial Windows code-signing or Apple notarisation certificates. Windows SmartScreen may show an unknown-publisher warning. On macOS, open the app with **Control-click > Open** the first time.

## What it does

- Accepts a PDF, DOCX, TXT, or Markdown master CV.
- Extracts the CV into private local Markdown for analysis.
- Searches daily for the roles and locations configured by the user.
- Filters grouped listings, member profiles, password-reset links, expired jobs, and repeat applications.
- Scores every role from 0 to 100 using the selected local Codex model, with an on-device fallback.
- Generates a unique styled PDF CV and cover letter for each qualifying role.
- Opens the exact job page and exact local application documents from the dashboard.
- Registers a native daily schedule through Windows Task Scheduler or a macOS LaunchAgent.

My Job Finder prepares and tracks applications. It does not silently submit applications in the public desktop release.

## Privacy

CVs, extracted Markdown, job history, generated PDFs, and scheduler state stay on the computer:

- Windows: `%LOCALAPPDATA%\My Job Finder`
- macOS: `~/Library/Application Support/My Job Finder`

AI analysis reuses the locally installed and authenticated [Codex CLI](https://developers.openai.com/codex/cli). No API key is stored by My Job Finder. If Codex is unavailable, the application uses its local matching and document-preparation fallback.

## Install

### Windows

1. Download `MyJobFinder-Setup.exe` from the latest release.
2. Run the installer and choose whether to add a desktop shortcut.
3. Open My Job Finder, select a CV, enter target roles and locations, then save the daily schedule.

The installer is per-user and does not require administrator access.

### macOS

1. Download the DMG matching the Mac processor.
2. Drag **My Job Finder** into **Applications**.
3. Control-click the app, select **Open**, and confirm the first launch.
4. Select a CV and configure the daily search.

## Requirements

- Windows 10 version 2004 or newer, or macOS 13 or newer.
- Internet access for job discovery.
- Optional: Codex CLI installed and signed in for model-based ranking and tailoring.

The release bundles the native UI, Node worker, PDF extraction libraries, and headless Chromium PDF renderer. Users do not need to install Node, .NET, Swift, Playwright, or LaTeX.

## Build from source

### Shared engine

```powershell
npm ci
npm run check
npm test
npm run desktop:build-worker
```

Node.js 22 or newer is required.

### Windows

Install the .NET 8 SDK, the Windows App SDK build prerequisites, and Inno Setup 6:

```powershell
winget install --id JRSoftware.InnoSetup --exact
npm run installer:windows
```

The installer is written to `artifacts\MyJobFinder-Setup.exe`.

### macOS

Install Xcode Command Line Tools and Node.js, then run:

```zsh
npm ci
npm run desktop:build-worker
zsh apps/macos/build-app.sh
zsh apps/macos/build-dmg.sh
```

The app bundle and DMG are written below `apps/macos/build/` and `artifacts/`.

## Architecture

```text
Master CV -> local Markdown -> job discovery -> match scoring
          -> tailored application data -> styled HTML -> PDF
          -> local dashboard and native daily scheduler
```

- `src/desktop/`: CV extraction, model selection, ranking, document generation, and desktop service.
- `apps/windows/`: WinUI 3 application and Windows installer tooling.
- `apps/macos/`: SwiftUI application and DMG tooling.
- `.github/workflows/`: cross-platform CI and tagged release builds.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Please report security or privacy concerns through the process in [SECURITY.md](SECURITY.md), not a public issue.

## License

My Job Finder is available under the [MIT License](LICENSE).
