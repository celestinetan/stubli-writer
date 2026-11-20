# Changelog

## 2.2 – 20 November 2026

- The four links at the bottom of the sidebar sit on one line: Import, Back up, Help, Privacy.
- One size for the same kind of text. The message shown when a list is empty ("Nothing to check", "The Trash is empty" and the like) was larger than the text around it; it now matches. On a book's Overview, chapter summaries and their Edit links are the same size as on the cards in the other tabs.
- "Start a book" stays on the same row as its title box when the book panel is beside the text.

## 2.1 – 20 November 2026

- Typing sounds are removed: the choice in Aa, the recordings and everything that played them. Writing is silent again, as before 1.9.

## 2.0 – 20 November 2026

- Typing sounds are now recordings of real keyboards, in place of sounds made by the app: Creamy (Cherry MX Red switches), Thocky (a Happy Hacking Keyboard with Topre switches), Clacky (Gateron Black) and Poppy (Cherry MX Clear). Each key has its own recorded stroke, with the release where the recording has one. The recordings are CC0, by el_boss, grcekh, handygaber and humi74 on Freesound; see docs/sounds.md. A keyboard's sound (210 to 360 KB) is fetched only when you choose it, then kept for writing offline.

## 1.9.1 – 20 November 2026

- Typing sounds, rebuilt to sound like a keyboard and not a beep. Each stroke now has the parts a real one has: the switch ticking, the key landing, the case ringing on several notes, the key coming back up when you let go, and a trace of the room. Every key has its own voice and its own place from left to right, long keys rattle a little, and no two strokes are alike. Choosing a sound plays a few words of typing. Still made by the app itself: no recordings, nothing downloaded.
- Fixed: the search box could, for an instant after opening, still hold the words from last time.

## 1.9 – 20 November 2026

- Typing sounds, if you'd like them: Aa has a "Typing sound" choice of Creamy, Thocky, Clacky or Poppy. Each keystroke is made by the app itself as you type, so there are no recordings, nothing is downloaded and it works without a connection. Off until you choose one; choosing one plays it.

## 1.8 – 20 November 2026

- Typing @ in a note that isn't in a book now says so, in a quiet line under the @, and offers to add the note to a book; the list of characters then opens straight away. It never takes Enter or the arrow keys, Escape closes it, and "Don't show this again" turns it off.
- Navigation, tidied. The button that hides the sidebar sits in the sidebar's own corner, so nothing floats above the writing. A book's Overview, Arrange chapters and Characters and lore come before its chapters, so they're never below a long list. The links at the bottom of the sidebar line up in two columns.
- Gaps in the top bar shows a small dot when the note has gaps, in place of a filled pill that looked switched on.
- The two tours at the top of Help each have their own line.

## 1.7.1 – 20 November 2026

- The privacy page has a paragraph on AI assistants: there's no AI inside, nothing you write is sent to one, and a story bible file is saved only with your notes.

## 1.7 – 20 November 2026

- A story bible for AI checks, without pasting a manuscript. A book can keep one file, "Story bible.md", up to date in its folder (in Google Drive, or a folder on the computer): what the book is about, the chapter summaries, characters, lore and fixed facts, with instructions for checking a chapter. An assistant connected to that place reads it, and the chapter, itself; Checks copies a one-sentence request and can open Claude, ChatGPT or Gemini. It's off until you choose it for a book, and stopping removes the file. Nothing is sent from Stubli Writer.
- Help has a new first topic, "How Stubli Writer works: where the app and your notes live", and the one-minute tour has a step for it.

## 1.6 – 20 November 2026

- Help, rewritten for someone new: 25 short topics that open one at a time, from "Your first five minutes" to what to do if something's wrong, with a search box. It covers everything the app does, including books, lore, worlds, checks, backups, iPhone use and how notes are saved as files.
- A second tour, for books: it opens a book and shows the Overview, Arrange, Characters, Lore and Checks in turn, then what they do while you write. The one-minute tour is brought up to date. Both start from the top of Help.

## 1.5 – 20 November 2026

- Checks: reminders of what may not agree with a book's cards. A name spelled nearly like one on a card ("Catherine", card "Katherine"), a fixed fact said differently ("Eyes: green", then "her blue eyes"), and names used several times with no card. Each is a question: open the chapter, add a card, or say "Not a problem", which is remembered in the book's header.
- Fixed facts on character and lore cards (under Edit), one per line, like "Eyes: green" or "Age: 34". They show on the card and are what Checks compares against. Colours and numbers are compared; other facts are there for you to read.
- A chapter with something to check says so in the line under its text.
- "Ask an AI to read for contradictions": copies a ready-made question with what the book is about, the chapter summaries, characters, lore and the writing, to paste into any AI assistant. Nothing is sent from Stubli Writer.

## 1.4 – 20 November 2026

- Lore: what must stay true in a story. A card for each place, rule, object, group or piece of history, under a book's new Lore tab. Once something has a card, its name gets a dotted underline in the chapters, and choosing it shows the card.
- Worlds: for more than one book in the same world. Name a book's world under Lore; any lore card or character you share across the world is then in every book set there. Cards are plain notes in `Books/<Book>/Lore` and `Worlds/<World>/Lore` (and `Characters`).
- Like characters, lore stays out of the notes list, search and exports.

## 1.3 – 20 November 2026

From a full review of the app as a writer would use it:

- A Night page (under Aa) for writing after dark. Someone new whose device is set to dark starts on it.
- The book opens beside your text on a wide screen, so the overview and characters stay in view while you write. "Show wide" gives it the whole screen; the characters map opens wide by itself.
- A quiet word count at the corner of the page, for the note or for what's selected. Aa can hide it.
- "New note" at the top of the sidebar.
- The start screen says what Stubli Writer is, suggests one place to keep notes, and offers the samples at the top. Only one notice shows above the writing at a time, and links in notices are easier to tap.

## 1.2 – 20 November 2026

- A book's Overview: the whole story on one page. What the book is about, then each chapter in order with what happens, when it happens, who tells it and how far along it is (draft, revised, done), plus its word count, gaps and characters, and totals for the book.
- You write the summaries yourself. They're kept in each chapter's header (`synopsis`, `when`, `told-by`, `status`; `premise` on the book), never in the writing, and never in an export.
- A book now opens on its Overview. The cards for moving chapters around are under Arrange.

## 1.1 – 18 November 2026

- Notes on this device: a third place to keep notes, inside the app, with no folder or account. Made for iPhone, where web apps can't open folders; works offline. The app asks the browser to keep the notes, and says plainly that they're not in the Files app.
- Back up: every note and picture in one .zip (any place: device, folder or Google Drive). A gentle reminder for notes kept only on the device, after a few days without a backup (Later puts it off for a week).
- Restore a backup (in Import notes): every note back where it was; a note changed since is kept as well, as a "(restored)" copy. Also reads .zip files made by the Mac's Compress. This is how notes move between places: back up, choose the new place, restore.

## 1.0 – 13 November 2026

The first public version, at https://celestinetan.github.io/stubli-writer/.

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
- Rename file and Move to Trash, at the foot of each note. Rename names the file after the note's title (only when you ask). Move to Trash keeps the note in a Trash folder in your notes folder, or in Google Drive's trash (also offline: it goes when the connection is back), with Undo right after.
- Appearance is a small panel under Aa that leaves the note in view, and now has a text size (Small, Medium, Large). Help is a panel at the side, so you can try things as you read.
- The sample notes open on the Welcome note, and say "Not kept" instead of "Saved".
- Fixed before release: choosing a gap inside a table in the Gaps panel opened the note but went nowhere; it now goes to the table.
- Books: a book holds chapters and characters (notes outside a book are one-offs, such as articles). Its board has two tabs. Chapters: cards in order, with a line about each, word count, gaps and who's in it, that you drag or move with arrows. Characters: a card each, with who they are and connections to other characters, set with buttons and shown on both cards.
- Name a character once: in a chapter, type @ and pick them (or add someone new); just the name is written. From then on every mention of them in the book is underlined lightly in their colour, and clicking it shows their card. A name that's also an ordinary word ("Will") can be set to count only where it's written @Will. Character cards stay out of search and the notes list.
- A sidebar for finding your way: where your notes are kept (choose it to change that, with a way back), Today and Search, books with their chapters and characters, folders of notes, and the Trash. Beside the page on a computer (☰ hides it), and sliding over the page on a phone.
- Characters as a map you make yourself: put cards anywhere, drag from the dot on one card to another to connect two people, and say what each is to the other: one side's words on each person's card ("Teresa: mother", "Ana: the daughter who asks too many questions"), shown next to that person on the line and together on both cards. Either side can be empty. Click a line to change them or remove it. No kinds or rules: new cards start around a loose circle and stay where you put them; places are saved in the book note, and Tidy up starts again.
- Arrange the sidebar like the Finder: right-click (or the … button, on a phone) for New note, New folder, Rename in place, Move to…, Add to a book and Move to Trash; drag notes into folders, folders into folders, notes onto a book to make them chapters, and chapters into a new order. Pictures and links in a moved note keep working, books keep their chapters, and Undo appears at the bottom after each change.
- Trash is a folder that works the same in a folder, in Google Drive and in the samples. Notes in it keep their place, so "Put back" returns them where they were; "Delete for good" asks first.
- A one-minute tour for someone new, offered once and optional: nine pop-ups, each next to the part it explains (writing, TK and Gaps, formatting, Today and search, the sidebar, books and characters, Export, Aa, Help), with Back, Next and Skip; arrow keys and Escape work. Help can start it again any time.
- Paperback interior PDF for a book: trim sizes 5×8, 5.25×8, 5.5×8.5 and 6×9 in; a wider inside margin for the binding by Amazon KDP's page-count rules; title, copyright (with ISBN), optional dedication and contents pages; chapter 1 on a right-hand page and each chapter on a new page; page numbers on the outside corners; optional running heads. ISBN and dedication are kept with the book.
- Export a book or a note: Word (.docx) in standard manuscript format (title page with word count, name and title on every page, double-spaced) or a clean layout; EPUB for ebook stores; PDF through the browser's print window (title page, contents, a new page per chapter, page numbers); or copied, formatted, for Medium, Substack or WordPress. Open gaps are listed first, with Show; they appear as [TK] in the file. Made in the browser; nothing is sent anywhere.
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
