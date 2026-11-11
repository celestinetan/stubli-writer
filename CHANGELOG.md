# Changelog

## 0.0.2 · 11 November 2026 (not released)

- Notes: Markdown with a small header (created, tags; type and synopsis reserved for book mode). Reading and saving a note gives back exactly the same file, including Windows line endings, a byte-order mark, and header lines from other apps.
- Gaps: finds `TK` and `@tk[request]`, but not inside words, code, links, web addresses or comments. Works between Chinese and Japanese characters.
- Storage: one interface for all storage; the folder route reads and writes `.md` files in a folder and its sub-folders, skipping hidden folders, refusing unsafe paths, and saving safely.
- Tests: 32 sample notes, 89 unit tests, and browser tests that save every sample to real browser storage and read it back unchanged.

## 0.0.1 · 11 November 2026 (not released)

- The empty frame of Stubli Writer: Stubli's Light and Paper modes, Figtree for the interface and Literata for writing, bundled on the site.
- A strict Content-Security-Policy in every build: the page only loads its own files.
- Tests: unit tests (Vitest) and browser tests in Chrome at laptop and phone size (Playwright).
- A GitHub Pages deploy workflow, switched off until release.
