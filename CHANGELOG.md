# Changelog

## 0.0.5 · 11 November 2026 (not released)

- Google Drive: "Continue with Google" on the start screen. Notes go in a "Stubli Writer" folder in your Drive, with the same sub-folders and Markdown files as on disk. Stubli Writer asks only for Google's narrowest permission (files it creates), never the rest of your Drive.
- Works without a connection: every note read and every save is kept on this device first. The status says "Saved on this device" until it reaches Drive, then "Saved". Changes made offline go up when the connection is back, even after the app was closed.
- Sign-in lasts about an hour and is kept in memory only. When it runs out, writing carries on; a quiet note offers "Continue with Google" to send what's waiting.
- Edits on two devices: the newer save wins and the other version is kept next to it as "Name (conflicted copy date time)", with a note saying so. A note created on two devices at once keeps both.
- The security policy now allows exactly two outside addresses: Google's sign-in (accounts.google.com) and Drive (www.googleapis.com).
- SETUP.md: how to run your own copy with your own Google app ID.

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

- The editor (Tiptap 3.32.0): Medium's formatting only. A floating bar on a selection (bold, italic, link, heading, small heading, quote), a + in the margin on wide screens for a divider, and Markdown shortcuts as you type (`# `, `> `, `- `, `---`, `**`).
- Gaps are drawn as chips while you write: `TK`, and `@tk[request]` as "TK · request". They stay plain text in the file, so they can sit inside bold text or a link.
- Formatting from other apps is never lost: tables, code blocks and HTML show as protected blocks and are saved exactly as written; inline code, strikethrough and checkboxes are kept quietly.
- Plain text stays as typed: "Tom & Jerry", "a < b", snake_case and 5 * 3 get no backslashes or entities.
- A note is only saved after you change it, a moment after you stop typing, and straight away when you leave the page.
- Pasting from the web keeps only Medium's formatting.
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
