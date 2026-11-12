# Changelog

## 1.0 – 12 November 2026

The first public version.

- A calm, distraction-free editor. The selection bar has bold, italic, link, code, two heading sizes, and a quote button that goes quote, pull quote, plain. The + adds pictures (with captions and three sizes), code blocks, a three-dot break, a subtitle and a drop cap. Markdown shortcuts work as you type.
- Gaps: `TK` and `@tk[request]` as chips, a panel of every open gap across all notes, and ⌘J to the next one.
- Today's daily note, a ⌘K switcher with search, and new notes that start on their title.
- Notes as Markdown in a folder on your computer, or in Google Drive (any browser, phone included, and offline), with conflicted copies instead of lost edits.
- Fixed before release: in Google Drive mode, typing before signing in on a new visit made a needless "conflicted copy" of each note you edited. The device now remembers which Drive version each note came from, so only real edits on another device make a copy.
- Fixed before release: pressing ⌘K right after choosing a note could close the new switcher at once (the browser announces a sheet's closing a moment late).
- Fixed before release: the start screen never offered "Reload to update", so it could stay on an old version. It now takes a newly published version by itself (nothing there can be lost).
- If Chrome doesn't open its folder window (for example when file editing is turned off for the site), the start screen now says so, how to fix it, and Chrome's own message, instead of doing nothing.
- Fixed before release: in folder mode, a note also changed in another app (Obsidian, TextEdit, a sync service) while open in Writer was overwritten on the next save. Writer now keeps the other version as a "conflicted copy" next to it, with a note saying so, as in Google Drive.
- Import from Bear, Obsidian or any Markdown folder, with pictures; other apps' formatting kept as protected blocks.
- Appearance (Aa): choose the writing font (Charter, Literata, Source Serif, Figtree), the page (White, Light, Paper) and the accent (Moss, Ink, Sea, Plum, Rust). New people start on a white page, in Charter, with Moss.
- Help: a ? button (and the ? key) with gaps, formatting, every shortcut and how notes are kept. A new notebook starts with a Welcome note that shows TK and the formatting by example.
- Writing comfort (from an independent review): a clear space between paragraphs; the line being typed stays well above the bottom of the window; while typing on a computer only the top bar's buttons step back (the bar stays solid and the save status stays); on touch screens nothing fades.
- The + works at every width: in the margin on wide screens, at the end of the empty line on phones and narrow windows.
- Gaps is a quiet label in the top bar, tinted only when the open note has gaps; the totals and this note's gaps come first in the panel.
- Installable, and opens without a connection.
- No server, no account, no tracking; a strict security policy that allows only Google's sign-in and Drive.

The entries below are the steps that led to 1.0.

## 0.0.8 · 12 November 2026 (not released)

- A plain privacy page (privacy.html), linked from the start screen and the app's footer. It opens without a connection too.
- Security checks on every test run: the built page has no inline code, its policy allows only Google's sign-in and Drive, and the app's code contacts nothing else. A harmful note (a javascript: link, HTML with scripts, an outside tracking picture) can't run code or reach other sites.
- Library updates: Dependabot suggests updates once a week, two weeks after a release, for review by hand. The deploy workflow's GitHub Actions are pinned to exact commits, and it runs npm audit and every test before publishing.
- SECURITY.md (how to report a problem) and docs/security.md (each risk, what's in place, what's left, and the GitHub settings to turn on).
- Fixed: the offline copy answered every page with the app; it now answers with the page asked for.

## 0.0.7 · 11 November 2026 (not released)

- Import notes (⌘K → Import notes, or the link at the bottom): choose Markdown files, or a whole folder such as a Bear export or an Obsidian vault. Notes and the pictures next to them are copied exactly into "Imported/<folder>", keeping sub-folders so picture links still work. Nothing is overwritten (a taken name gets " (2)"); hidden folders like .obsidian are left out, and anything that isn't a note or a picture is listed as left out.
- Plain-text notes (.txt) come in as .md.
- Fixed: closing a sheet just as you pressed ⌘K could close the switcher straight away.
- Fixed: Paper mode no longer fades in from Light each time the app opens.
- The footer links line up, and secondary buttons in sheets are visible as buttons.

## 0.0.6 · 11 November 2026 (not released)

- Installable: on a Mac from Chrome's address bar (Install), and on iPhone or iPad with Share → Add to Home Screen, as "Writer" with the Stubli icon.
- Opens with no connection once it has been opened before: a small service worker keeps a copy of this version's files on the device. It only handles the app's own files, never requests to Google.
- When a new version is published, a quiet note offers "Reload to update" (only once your note is saved), so the app never changes in the middle of a sentence.
- Google Drive mode asks the browser to keep the notes stored on the device instead of clearing them when space runs low.
- Checked by Celestine on her Mac (11 Nov): installed from Chrome, and opened with no connection. iPhone and iPad wait for the published (https) address.

## 0.0.5 · 11 November 2026 (not released)

- Google Drive: "Continue with Google" on the start screen. Notes go in a "Stubli Writer" folder in your Drive, with the same sub-folders and Markdown files as on disk. Stubli Writer asks only for Google's narrowest permission (files it creates), never the rest of your Drive.
- Works without a connection: every note read and every save is kept on this device first. The status says "Saved on this device" until it reaches Drive, then "Saved". Changes made offline go up when the connection is back, even after the app was closed.
- Sign-in lasts about an hour and is kept in memory only. When it runs out, writing carries on; a quiet note offers "Continue with Google" to send what's waiting.
- Edits on two devices: the newer save wins and the other version is kept next to it as "Name (conflicted copy date time)", with a note saying so. A note created on two devices at once keeps both.
- The security policy now allows exactly two outside addresses: Google's sign-in (accounts.google.com) and Drive (www.googleapis.com).
- SETUP.md: how to run your own copy with your own Google app ID.
- Checked by Celestine in Chrome with her real Google account (11 Nov): signing in and saving today's note to Drive.

## 0.0.4 · 11 November 2026 (not released)

- First open asks "Where should your notes live?": a folder on this computer (Chrome, Edge, Arc), Google Drive (next update), or sample notes to try it. The choice is remembered; a remembered folder reopens with one click when the browser asks.
- Today: opens today's note (`Daily/YYYY-MM-DD.md`, titled with the date), ready to type on a computer. It's only saved once you write in it.
- ⌘K (Ctrl+K): find a note by its words (accents and case ignored), open a recent one, or start a new note. New notes are named by date and time and start on their title.
- The gap panel lists every open gap across all notes with its line; choosing one opens the note with the gap selected. ⌘J moves to the next gap in a note.
- Images: + → Image saves a picture into `images/` in your notes folder and shows it. Pictures from other websites aren't loaded, to keep reading private; a quiet note says so.
- The top bar fades while you type and comes back when you move the pointer. On a phone, the switcher and the gap panel fill the screen.
- Fixed: after choosing a note in the switcher, the cursor now lands in the editor (the browser had put it back on the closed note).
- Checked by Celestine on her Mac in Chrome (11 Nov): choosing a real folder, saving, reopening after a reload, and edits from another app.

## 0.0.3 · 11 November 2026 (not released)

- The editor (Tiptap 3.32.0): A small, careful set of formatting. A floating bar on a selection (bold, italic, link, heading, small heading, quote), a + in the margin on wide screens for a divider, and Markdown shortcuts as you type (`# `, `> `, `- `, `---`, `**`).
- Gaps are drawn as chips while you write: `TK`, and `@tk[request]` as "TK · request". They stay plain text in the file, so they can sit inside bold text or a link.
- Formatting from other apps is never lost: tables, code blocks and HTML show as protected blocks and are saved exactly as written; inline code, strikethrough and checkboxes are kept quietly.
- Plain text stays as typed: "Tom & Jerry", "a < b", snake_case and 5 * 3 get no backslashes or entities.
- A note is only saved after you change it, a moment after you stop typing, and straight away when you leave the page.
- Pasting from the web keeps only the editor's formatting.
- For now the editor works on a sample note kept in the page; folders arrive with the app shell (milestone 3). Images already in a note are kept; adding images comes with folders.

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
