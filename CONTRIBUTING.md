# Contributing

Contributions to My Job Finder are welcome.

## Development setup

1. Install Node.js 22 or newer.
2. Run `npm ci`.
3. Run `npm run check` and `npm test` before making changes.
4. Build the platform client you changed.

Windows development requires the .NET 8 SDK and Windows App SDK prerequisites. macOS development requires macOS 13 or newer and Xcode Command Line Tools.

## Pull requests

- Keep candidate data, CVs, generated documents, browser profiles, and job histories out of commits.
- Add or update tests for behaviour changes.
- Keep document generation evidence-based. Never invent candidate experience, education, certifications, or contact details.
- Explain user-facing changes and any platform-specific limitations.
- Keep pull requests focused and avoid unrelated formatting churn.

## Release builds

Tagged versions matching `v*.*.*` are built by GitHub Actions. Release binaries must not be committed to the repository. Windows and macOS installers are uploaded to the matching GitHub Release with SHA-256 checksums.
