# Stubli Writer: build plan

**Based on:** `design-decisions.md` (22 decisions, 11 Nov 2026) and `project-considerations.md`
**Status:** plan only. **Nothing is built until you say go.**

---

## The shape of the work

| Release | What you get | Estimate |
|---|---|---|
| **v1** | A calm, Medium-style editor with gaps (`TK`, `@tk[…]`), a Daily Note, search, a gap panel; notes in a folder on your Mac or in Google Drive; works offline and on your phone | 8 to 10 working sessions |
| v1.5 | The MCP server and plain-prompt routines, so any AI can read your notes and leave gap suggestions you accept in the app | 2 to 3 sessions |
| v2 | Book mode: chapters as cards, characters, then compiling to EPUB and print PDF | 5 to 8 sessions |

Estimates are guesses, not measurements. v1 is larger than the 3 to 5 sessions in the
considerations document because Google Drive and the Medium-style editor were added since.

This plan details **v1 only.** v1.5 and v2 get their own plans when we reach them.

---

## v1 milestones

Each milestone ends with the work checked on screen (day and night, laptop and phone width,
empty and full, reduced motion), using sample notes, never your real ones, then committed. A
milestone isn't done until its checks pass.

### 0. Set-up (1 session)

- Create the project `stubli-writer` in your Stubli folder (moving this session there first).
- Vite, TypeScript, React; tests with Vitest (logic) and Playwright (real browser).
- Read `Stubli/docs/DESIGN.md`; add the reading serif and the gap highlight to it.
- Bundle the fonts: Figtree, plus Charter, Source Serif 4 and Newsreader for the comparison.
- A strict Content-Security-Policy from day one.
- A GitHub Pages deploy workflow, built but not switched on.

**Check:** an empty page deploys locally, passes the CSP, and shows the three serifs side by side
so you can choose one.

**Needs you:** pick the serif from the comparison.

### 1. Notes and gaps on disk (1 session)

- The note format: Markdown with a small header (`created`, `tags`), plus fields reserved now
  for later (`type`, `synopsis`) so book mode needs no conversion.
- The gap reader: finds `TK` and `@tk[…]`, ignores "TK" inside words and code.
- One storage interface that the editor uses, whichever storage is chosen.
- The folder route: pick a folder, read and write `.md` files, remember the folder between
  visits (asking again only when the browser requires it).

**Check:** automatic tests that reading then saving a note never changes it, across about 30
sample notes (headings, lists, quotes, links, gaps, odd characters, Chinese and Japanese).

### 2. The editor (2 sessions)

**First step, a test:** confirm Tiptap can convert Medium's formatting set to Markdown and back
without changing anything. If it fails, we stop and talk before going further.

- Tiptap with Medium's set only: title, two heading sizes, bold, italic, link, quote, lists,
  divider, image.
- No toolbar at rest; a floating bar on selection; `+` on an empty line for image or divider;
  Markdown shortcuts as you type.
- Gap chips: `TK` and `@tk ` become highlighted chips; Enter or Tab closes a request.
- Pasting from the web keeps only the allowed formatting.
- Saves automatically as you type.

**Check:** the round-trip tests again through the editor; typing and pasting in a real browser;
undo; a long note (about 20,000 words) stays smooth.

### 3. The app around the editor (2 sessions)

- One centred column, top bar faint until you move the pointer.
- **Today:** opens or creates today's Daily Note (in a `Daily/` folder), listing gaps still open.
- **⌘K switcher:** recent notes, new note, and word search across all notes.
- **Gap panel:** every open gap across all notes; click to jump; ⌘J for the next gap.
- Day and night themes following the system, with a toggle; reduced-motion fallbacks.
- Phone layout: panels open full-screen; tap targets of at least 44 px.
- First open: "Where should your notes live?" (folder or Google Drive).
- Plain-word messages for every empty and error state.

**Check:** the full audit from your build loop on these screens: type sizes, contrast, tap
targets, focus rings, empty states, night, phone.

### 4. Google Drive (2 to 3 sessions)

- Sign in with Google using the narrowest permission (only files the app creates).
- A "Stubli Writer" folder in Drive; the same note format.
- Offline: notes kept on the device, uploaded when back online; a small "Saved" or
  "Waiting to upload" status.
- Edits on two devices: the newer wins, the other is kept as a "conflicted copy" note.
- Access lasts about an hour and renews quietly; nothing long-lived is stored.

**Check:** a test Google account (yours, set up by you), two browsers editing the same note,
going offline and back, and a sign-out.

**Needs you:** create the free Google Cloud project and its "Sign in with Google" app ID (I'll
give you the steps), do the sign-in yourself, and check Google's current rules for the
narrow permission.

### 5. Install and offline (half a session)

- Installable on Mac (Dock), iPhone and iPad (Home Screen).
- Opens and works with no connection.

**Check:** install on your phone from the local network; open in flight mode.

### 6. Import (half a session)

- An "Import" action that brings in `.md` files (for Google Drive mode; in folder mode you can
  also just copy files in).
- Imported formatting trimmed to Medium's set.

**Check:** a Bear export and an Obsidian folder (sample files, not yours).

### 7. Security and privacy (half a session)

- Confirm the Content-Security-Policy only allows Google's Drive servers.
- Lock library versions; switch on automatic alerts for known flaws.
- A plain privacy page: "your notes never reach us; we store nothing."
- Notes on protecting the GitHub repo (passkey, reviewed changes to the main branch).

**Needs you:** turn on GitHub protection settings (or give a clear yes for me to do it).

### 8. Final audit and release (1 session)

- Your build-loop audit again; fix the top five findings.
- A test install as a stranger: a fresh browser, folder mode and Drive mode.
- README (with your standard disclaimer), MIT licence, CHANGELOG.

**Needs you:** a yes before the repo and site go public. Before that, a trademark and domain
check on the name.

---

## Decided not to do in v1

- Any AI (that's v1.5, through MCP; the app never calls an AI).
- Book mode and compiling (v2).
- Sync through GitHub, Word export, Evernote import, meaning-based search.

## The biggest risks, and how this plan meets them

| Risk | Where it's met |
|---|---|
| Tiptap changing your Markdown when saving | Milestone 2 starts with a test, and stops if it fails |
| Losing notes | Round-trip tests (1, 2); conflicted copies (4); real files on disk or in Drive |
| Safari or iPhone gaps | Google Drive mode (4); install and offline (5) |
| Google's rules for sign-in | Checked with you in milestone 4 |
| A compromised site | Milestone 0 (CSP) and milestone 7 |

## What I need from you to start

1. A go-ahead.
2. Agreement to move this session into your Stubli folder, so the project lives with the rest of
   Stubli rather than in a temporary folder.
