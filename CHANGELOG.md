# Changelog

## [1.3.6] / 2026-10-03
### Fixed
- Restore Obsidian 1.13.1 API definitions and override Moment.js to patched version 2.31.0 to resolve npm audit findings.
- Update development dependencies to current compatible releases, retaining TypeScript 6.0.x for typescript-eslint compatibility and Node 24 definitions.
- Remove obsolete Electron type stubs, unused internal Obsidian typings, and the builtin-modules dependency.
- Use bundler module resolution for TypeScript 6 and permit esbuild installation scripts across compatible version updates in npm 12.
- Make npm test run unit tests without copying files to a hard-coded vault. Electron remains a type-only development dependency; its binary download is disabled in npm 12.

## [1.3.5] / 2026-10-02
### Fixed
- Treat bare Windows picture drives such as `D:` as drive roots, matching the file export examples in ToDo.md.
- Verify relative picture subfolders with real filesystem output as well as the export settings matrix.

## [1.3.4] / 2026-10-02
### Fixed
- Export pictures into the configured relative folder beside each HTML file, including preserved vault folders and parent paths.
- Prefer the absolute picture export directory when both picture paths are configured and generate absolute file URLs for it.
- Apply the HTML link prefix to image references without changing the output directory, and encode reserved characters in image filenames.

## [1.3.3] / 2026-10-02
### Fixed
- Preserve URI encoding in returned Foundry upload paths so image filenames with spaces use `%20` instead of `%2520`.
- Cache the confirmed image URI by its requested filesystem path so duplicate references reuse one upload and the correct URL.

## [1.3.2] / 2026-10-02
### Fixed
- Send image uploads as JSON with Base64 file data through the relay's documented upload contract.
- Omit image data from failed-request diagnostics.
- Align release versions and packaging with the current lowercase Obsidian plugin ID.
### Changed
- Rename Export Settings to File Export Settings and promote Foundry Export to a main settings page.
- Move internal link resolution, Base64 picture embedding and frontmatter removal into Base Output handling.
- Rename the JavaScript editor setting and the attributes/classes settings group as requested in ToDo.md.

## [1.0.0] / 2026-09-14
### Added
- First reworked release from MarkdownToFoundry to NoteToFoundry
### Fixed
### Changed
### Removed
### Deprecated
### Security
