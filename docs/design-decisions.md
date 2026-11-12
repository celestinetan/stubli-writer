# Design Decisions

**Project:** personal, open-source notebook built around the TK (to come) habit
**Companion to:** `project-considerations.md`
**Status:** Phase 2. Options and recommendations only. **You decide; nothing is built yet.**

How to use this document: go through the questions in order. Each has options, trade-offs and my
recommendation. Tell me your pick (or "go with yours") and I'll record it in the log below. Some
questions depend on earlier answers; those are flagged.

## Ground rules you've set

- **No extra cost for AI.** The app never charges or bills per use. AI help runs on what people
  already have: a Claude subscription, another AI assistant, or a free local model.
- **Any AI, not only Claude.** Nothing in the design may depend on one AI company.

## Decision log

| #  | Question                          | My recommendation                   | Your choice |
|----|-----------------------------------|-------------------------------------|-------------|
| 1  | What v1 includes                  | B: editor, gaps, Daily Note         | **B** (11 Nov) |
| 2  | What kind of app                  | A: installable web app (PWA)        | **A** (11 Nov) |
| 3  | Editor engine                     | B: CodeMirror 6                     | **C** Tiptap, Medium-style editing (11 Nov; changed from B) |
| 4  | Where notes live                  | B: a folder on your Mac             | **B**, with Google Drive as a place to keep that folder (11 Nov) |
| 5  | Sync between devices              | A in v1, E (Google Drive) in v2     | **A + E in v1**: no sync by default, Google Drive as an option (11 Nov) |
| 6  | Note file format                  | B: Markdown with small front matter | **B**, header hidden in the editor (11 Nov) |
| 7  | Gap syntax                        | D: `TK` and `@tk request`           | **D** (11 Nov); requests shown as chips, saved as `@tk[request]` |
| 8  | How the AI shows up               | C: it reviews, you decide           | **C** (11 Nov); suggestions with a source, kept in a side file until accepted |
| 9  | Where the AI runs                 | C: your own AI tool, through MCP    | **C** (11 Nov): one MCP server, plain Markdown prompts; Claude skills maybe later |
| 10 | Search                            | A: full-text, in the app            | **A + C** (11 Nov): word search in the app, meaning search via your AI |
| 11 | Screen layout                     | A: one column, panels on demand     | **A** (11 Nov): Today, ⌘K switcher, gap panel, ⌘J next gap |
| 12 | Type and theme                    | B: serif text, Figtree interface    | **B, Literata** (11 Nov, after the on-screen comparison): same reading font as Stubli |
| 13 | Importing old notes               | B: Markdown folder only             | **B** (11 Nov) |
| 14 | Tech stack                        | C: Vite, TypeScript, React (changed from B because of Tiptap) | **C** (11 Nov) |
| 15 | Distribution and licence          | B: public static site + repo, MIT   | **B** (11 Nov), on GitHub Pages, with the security measures listed under Question 15 |
| 16 | Name                              | OpenWrite (updated 11 Nov, after a clash check) | **Stubli Writer** (11 Nov), part of your Stubli family |
| 17 | Chapters as cards (added 11 Nov)  | A: a book index note + card board   | **A** (11 Nov) |
| 18 | Characters (added 11 Nov)         | C: you name them, app finds them, AI drafts summaries | **C** (11 Nov) |
| 19 | When "book mode" ships            | v2, with file shapes fixed in v1    | **B** (11 Nov) |
| 20 | Book export formats (added 11 Nov) | B: EPUB and print PDF              | **B** (11 Nov) |
| 21 | How the print PDF is made         | B: Typst, in the browser            | **B** (11 Nov), after a test book |
| 22 | What compiling includes           | B: book details, extra pages, a pre-flight check | **B** (11 Nov) |
| 23 | Character cards and connections (added 12 Nov) | A: cards with written connections, shown both ways | **A** (12 Nov) |

---

## 1. What does v1 include?

**Why it matters.** Medium's TK spans an editor, gaps, a Daily Note, memory across many sources,
skills, social feedback, publishing and collaboration. A personal version that tries all of it
never ships. This one answer sets the size of every later decision.

| Option | v1 contains | Effort | Risk |
|---|---|---|---|
| A. Gaps only | Editor, notes list, gap panel | Smallest | Feels like a plain notes app with one trick |
| **B. Gaps and Daily Note** | A, plus a dated note that opens each day and gathers open gaps | Small | None worth naming |
| C. B plus AI | B, plus an agent that suggests fills | Medium | AI choices made before you've used the core |
| D. Match TK | C, plus memory imports, publishing, sharing | Large | Months of work, needs a server |

**Recommendation: B.** The gap list and the Daily Note are the two habits that make TK useful
without AI. Shipping them first tells us how you really write before choosing the AI design.

---

## 2. What kind of app is it?

**Why it matters.** It decides which devices work, how it installs, whether it works offline and
how much code we maintain.

```
A. Web app (PWA)        B. Desktop app (Tauri)    C. Obsidian plugin       D. Local server on Mac
 browser ─ static site   native window ─ files     Obsidian ─ your plugin    browser ─ localhost ─ files
 any device, offline     Mac/Win/Linux, files       Obsidian's editor/sync    Mac only, full file access
```

| | Pros | Cons |
|---|---|---|
| **A. PWA** | Free hosting, no install step, works on phone and iPad, offline | Real file access only in Chromium on desktop |
| B. Desktop (Tauri) | Full file access everywhere on desktop, feels native | Builds and signing per OS, no phone |
| C. Obsidian plugin | Least work: editor, files, sync and plugins exist | Obsidian's busy interface, not your design; tied to one app |
| D. Local server | Full file access, MCP in the same process | Must be running; Mac only; no phone |

**Recommendation: A.** It matches how you already ship (static, GitHub Pages, free) and reaches
your phone. Its file-access gap is handled by Question 4.

---

## 3. Which editor engine?

**Why it matters.** The editor is the product. Building one is the most common way a notes app
goes wrong (undo, IME, mobile keyboards, paste).

| | What you see | Pros | Cons |
|---|---|---|---|
| A. Plain textarea | Raw text | Tiny, robust | No highlighting of gaps or headings |
| **B. CodeMirror 6** | Markdown, styled as you type (headings big, `**` faded) | Markdown stays the source of truth; gap highlighting is easy; strong on mobile and IME | Not true rich text; `#` and `*` visible but quiet |
| C. Tiptap (ProseMirror) | Rich text, like Google Docs | Most familiar for non-technical writers | Converting to and from Markdown loses detail; heavier |
| D. Milkdown | Rich text over Markdown | Markdown-native rich text | Smaller community, more edge cases |

**Recommendation: B.** It keeps files plain and makes the gap marker a simple highlight. It's
the engine behind several well-known Markdown writing apps.

**Your choice: C, Tiptap, because you like how writing on Medium.com works.** How we keep its
weak spot (Markdown conversion) harmless:

- **Keep to Medium's small set of formatting:** title, two heading sizes, bold, italic, link,
  quote, bulleted and numbered lists, a divider, and images. All of these convert to Markdown
  and back without loss. Anything outside this set (tables, colours, underline) isn't offered.
- **Medium-style controls:** no toolbar at rest. Selecting text shows a small floating bar
  (bold, italic, link, heading, quote). A `+` on an empty line adds an image or a divider.
  Markdown shortcuts still work as you type (`# `, `> `, `**`).
- **Gaps** are a highlighted mark in the editor and saved as plain `TK` / `@tk …` text in the
  file, so AI tools and other editors read them normally.
- **Test before trusting:** a round-trip test (open, save, compare) runs on sample notes so
  saving can never quietly change your writing.

---

## 4. Where do notes live?

**Why it matters.** It decides data safety, which browsers work, and whether Claude can read your
notes (Question 9 needs files on disk).

```
A. Browser storage      B. Folder on your Mac        C. GitHub repo           D. Both A and B
 [app]─IndexedDB         [app]─~/Notes/*.md           [app]─GitHub API─repo    [app]─IndexedDB
 any browser             Chrome/Arc/Edge desktop      any browser, token       └─ mirror to folder
 can be wiped            Claude can read them         versioned, synced         when available
```

| | Pros | Cons |
|---|---|---|
| A. Browser storage | Works everywhere | Can be wiped (Safari after 7 days unvisited); invisible to Claude |
| **B. Folder on your Mac** | Real Markdown files; iCloud/Time Machine back them up; Claude reads them | Desktop Chromium only (not Safari) |
| C. GitHub repo | Sync and history for free; works on phone | You paste a token; needs a connection to save remotely; conflicts |
| D. Browser + folder mirror | Works everywhere, files where possible | Two copies that can drift apart |

**Recommendation: B for v1.** You write mostly on the Mac, and real files unlock Claude and free
backups. Phone access comes with Question 5.

**Your choice: B, with Google Drive as an option.** Two levels:

1. **In v1, at no extra code:** with Google Drive for desktop installed, pick a folder inside
   Google Drive as your notes folder. The app writes plain files; Drive backs them up and
   copies them to your other computers. AI tools read them through MCP as normal. One caution:
   if Drive is set to "stream files", open notes may need a moment to download. Choosing
   "mirror files" (or making the notes folder available offline) avoids that.
2. **Later, as real sync:** the app talks to Google Drive directly, which also works on a phone.
   That's option E in Question 5.

---

## 5. How do notes sync between devices?

**Why it matters.** Without sync, the phone can't capture into the same notebook. With it comes
conflicts and possibly a third party. *Depends on Question 4.*

| | How | Pros | Cons |
|---|---|---|---|
| **A. None in v1** | Mac only | Simplest; no conflicts | No phone capture yet |
| B. iCloud Drive folder | Put the notes folder in iCloud | Zero code on the Mac | The web app can't open iCloud folders on iPhone or iPad |
| **C. GitHub repo** | App commits notes through the GitHub API | Free, versioned, works on phone; Claude reads the local clone | Token handling; simple conflict rule needed |
| D. Your own Cloudflare Worker | Small sync service in your account | Fast, flexible | A server to maintain; free-tier write limits |
| **E. Google Drive** | The app signs in with Google and reads and writes a notes folder in your Drive | Free (uses your Drive storage); works on phone and in Safari; familiar to writers; Drive keeps earlier versions; on the Mac the same folder is the one MCP reads | Needs a Google sign-in setup (a free Google Cloud project and an app ID); simple conflict rule needed; Google may ask for a verification step before strangers can use the public site |

**Recommendation: A now, E in v2.** Prove the writing experience first. Google Drive fits how
writers already work better than GitHub, works on your phone, and the same Drive folder serves
the Mac app and your AI tools. GitHub (C) stays a good choice for people who want full history.

Note on E: the app would ask only for access to files it created itself (Google's narrowest
Drive permission), never your whole Drive. What verification Google requires for that, and
the current limits, should be checked when we build.

**Your choice: A + E, both in v1.** On first open, the app asks where to keep notes:

```
Where should your notes live?
  ( ) A folder on this computer      Chrome, Arc or Edge on a computer
  ( ) Google Drive                   Any browser, including your phone
```

What that means for the build:

- **Two storage routes behind one interface,** so the editor doesn't care which is in use.
- **This also fixes the Safari and iPhone gap from Question 4:** where folders aren't available,
  Google Drive is.
- **Offline on the phone:** notes are kept in browser storage and uploaded when you're back
  online. A small "saved" or "waiting to upload" status shows which.
- **Edits on two devices:** the newer version wins, and the other is kept as a "conflicted copy"
  note beside it, so nothing is lost.
- **One-time setup:** a free Google Cloud project with an app ID for "Sign in with Google". You
  do the sign-in and setup yourself; the app ID is not a secret and lives in the config.
- **v1 grows** by roughly 2 to 3 working sessions (estimate).

---

## 6. What format is a note on disk?

**Why it matters.** Format is forever. It must read cleanly in other apps and hold the little
metadata the app needs.

```
A. Plain                 B. Small front matter          C. Sidecar file
# Lisbon trip            ---                            lisbon-trip.md
The tram was TK.         created: 2026-11-11            lisbon-trip.json  ← metadata
                         tags: [travel]
                         ---
                         # Lisbon trip
```

| | Pros | Cons |
|---|---|---|
| A. Plain Markdown | Cleanest | Nowhere for created date or tags beyond the file system |
| **B. YAML front matter** | Standard in Obsidian, Jekyll, iA Writer; one file per note | A few lines of metadata at the top |
| C. Sidecar JSON | Note text untouched | Two files per note; easy to separate by accident |

**Recommendation: B,** with as few fields as possible (created, maybe tags).

---

## 7. How do you write a gap?

**Why it matters.** It's the signature interaction. It must be fast to type, impossible to miss,
and still plain text in any other editor.

| | Example | Pros | Cons |
|---|---|---|---|
| A. Bare `TK` | `The law passed in TK.` | The real publishing habit; two keystrokes | No room to say what's missing |
| B. `@tk` with a request | `@tk the year this law passed` | Says what to find; matches Medium | Longer; where the request ends is unclear |
| C. Brackets | `{TK: the year this law passed}` | Clear start and end | More typing, looks technical |
| **D. A and B** | `TK` for quick holes, `@tk …` to the end of the line for requests | Fast when you're in flow, specific when needed | Two forms to explain |

**Recommendation: D.** Both are plain text, and both get highlighted and listed in the gap panel.

**Your choice: D.** In the editor (Tiptap), typing `TK` or `@tk ` turns into a highlighted chip;
Enter or Tab closes a request. In the file, a request needs a visible end so a sentence can
carry on after it, so it's saved with square brackets:

```
Editor:  The law passed in [TK]. Then the city [the year this law passed] grew.
File:    The law passed in TK. Then the city @tk[the year this law passed] grew.
```

Still plain, readable text for other editors and AI tools. Typing `@tk[…]` by hand also works.

---

## 8. How does the AI show up?

**Why it matters.** The most praised idea in the launch was "the AI prompts me, I don't prompt
the AI". This decides whether the tool sharpens your thinking or writes for you.

| | Behaviour | Pros | Cons |
|---|---|---|---|
| A. Never | No AI anywhere | Purest; zero cost | You fill every gap by hand |
| B. On request, inline | You trigger a fill in the editor; a suggestion appears in place | Fast | Needs AI inside the app, which your no-extra-cost rule rules out |
| **C. It reviews, you decide** | On request or at day's end, the agent reads your notes, proposes fills **with sources**, and asks one good question; you accept each one | Keeps the thinking yours; matches the "prompts me" idea | Slower than auto-fill |
| D. Automatic | Fills gaps as you type | Feels magical | Distracting; silent errors; also needs AI inside the app |

**Recommendation: C.** Never insert anything you haven't accepted, and always show where a fact
came from.

---

## 9. Where does the AI run?

**Why it matters.** It sets the cost, where keys live, which devices get AI, and whether you're
tied to one AI company. *Depends on Questions 4 and 8.*

**Your rule narrows this.** No extra cost and any AI means the app never calls an AI itself and
never holds an API key. Instead, the AI tool you already use comes to your notes. That rules out
an "API key in the app" option.

The neutral way to do this is **MCP** (Model Context Protocol), an open standard for connecting
AI tools to data. Claude (desktop and Code) supports it, and so do many others: Cursor, VS Code,
Gemini CLI, LM Studio, and ChatGPT's connectors (ChatGPT needs the server reachable over the
web rather than local). This is from what I knew before today and should be checked for each
tool when we build.

```
                 ┌─ Claude (your subscription)
~/Notes/*.md ─ MCP server ─┼─ ChatGPT, Gemini, Cursor, VS Code …
                 └─ a free local model (Ollama, LM Studio)
```

| | How AI reaches your notes | Pros | Cons |
|---|---|---|---|
| A. No AI | It doesn't | Free, simplest | No AI help |
| B. Plain files only | Any AI tool that can open a folder (Claude Code, Codex, Gemini CLI) reads the Markdown directly | Zero extra code; works today | Each tool learns the gap format its own way; no "list open gaps" command |
| **C. A small MCP server, plus instructions in plain Markdown** | The MCP server gives every tool the same actions: list notes, read, search, list open gaps, propose a fill. The routines ("fill my gaps", "wikify", "daily review") are written as plain Markdown prompt files in the repo, not Claude-only skills | Same behaviour in every AI tool; one small package; still free | Only where your AI tool runs (your Mac, mostly); not inside the editor |
| D. C, plus Claude skills as an extra | As C, with the same routines also packaged as Claude skills and a plugin for one-click use in Claude | Smoothest in Claude, still works everywhere else | Two copies of each routine to keep in step |

**Recommendation: C.** It's Medium's $12-a-month Pro feature (MCP) at no cost, keeps keys out of
the browser, and treats every AI the same. D is a cheap add-on later if you find yourself
mostly in Claude.

**What this means for the editor.** No AI button lives in the editor. Gaps you mark in the app
are what the AI picks up, and its proposed fills come back as suggestions you accept in the app
(see Question 8).

---

## 10. How does search work?

**Why it matters.** "Find the sentence I wrote last week" is half of what the TK agent does.

| | Pros | Cons |
|---|---|---|
| **A. Full-text in the app** (e.g. MiniSearch) | Instant, offline, tiny | Matches words, not meaning |
| B. Meaning-based in the browser | Finds related ideas | Large model download; slow on phones |
| C. Ask your AI through MCP | Understands meaning; no extra build | Mac only; not in the editor |

**Recommendation: A in the app, with C for free once Question 9 is C.**

---

## 11. Screen layout

**Why it matters.** Distraction-free means the writing owns the screen. Everything else must be
one keystroke away but invisible at rest.

```
A. One column, panels on demand        B. Three panes                   C. Sidebar + editor
┌──────────────────────────────┐       ┌──────┬─────────────┬──────┐    ┌──────┬──────────────────┐
│                     [≡] [TK 3]│       │Notes │             │ Gaps │    │Notes │                  │
│      # Lisbon trip            │       │      │  # Lisbon   │ • 3  │    │Daily │  # Lisbon trip   │
│      The tram was TK.         │       │      │             │      │    │Gaps 3│                  │
│      ⌘K find   ⌘J next gap    │       │      │             │      │    │      │                  │
└──────────────────────────────┘       └──────┴─────────────┴──────┘    └──────┴──────────────────┘
```

| | Pros | Cons |
|---|---|---|
| **A. One column** | Calmest; best on phones | Navigation hidden until you ask |
| B. Three panes | Everything visible | Busy; cramped on laptops; poor on phones |
| C. Sidebar + editor | Familiar, easy to learn | Sidebar always competes with the text |

**Recommendation: A.** A ⌘K switcher, a gap count that opens the gap panel, and "next gap" (⌘J)
cover navigation.

---

## 12. Type and theme

**Why it matters.** Reading your own writing for hours is close-up work, where your rules allow a
serif.

| | Pros | Cons |
|---|---|---|
| A. Figtree everywhere | Consistent with Stubli | Sans text tires the eye over long drafts |
| **B. Serif for text, Figtree for the interface** (e.g. Newsreader or Source Serif 4) | Comfortable long reading; clear split between your words and the app | Two typefaces to bundle |
| C. Monospace (iA Writer style) | Writerly, focused | Less pleasant for long prose |

Theme on any option (updated 11 Nov to follow Stubli: Light and Paper modes, no dark mode, as decided for Stubli on 8 Nov): a Light/Paper switch, Moss green only
for actions and the gap highlight, no borders at rest, fonts bundled (no Google Fonts calls).

**Recommendation: B.**

---

## 13. Importing old notes

**Why it matters.** A new notebook is empty, and an empty notebook isn't used. But importers are
fiddly.

| | Pros | Cons |
|---|---|---|
| A. None | No work | You start from zero |
| **B. Markdown folder** | Covers Obsidian, iA Writer, and Bear's Markdown export | Not Evernote or Apple Notes directly |
| C. B + Evernote (.enex) + Bear (.textbundle) | Wider reach | Each format has edge cases (attachments, links) |

**Recommendation: B.** With Question 4 = B, "import" is just copying files into the folder.

---

## 14. Tech stack

**Why it matters.** It decides how easy it is for you, me and contributors to change things
later, and the size of what users download.

| | Pros | Cons |
|---|---|---|
| A. No build step (plain JS, modules from a CDN) | Simplest to host and read | Harder to organise as it grows; CDN dependency |
| **B. Vite + TypeScript + Preact** | Small output, typed, fast; easy to host statically | A build step |
| C. Vite + React | Largest ecosystem | Heavier for a single-screen app |
| D. SvelteKit | Pleasant, small | Less common; fewer people can contribute |

**Recommendation: B.** The MCP server would be a separate small Node package in the same repo.

**Updated recommendation after Question 3 (Tiptap): C, Vite + TypeScript + React.** Tiptap has
official React support, and most of its examples and extensions assume React. Preact can run
them through a compatibility layer, but that's a common source of odd editor bugs. The card
board in book mode also has well-tested React drag-and-drop libraries with keyboard support.
React costs a slightly bigger download, which matters little next to the editor itself.

---

## 15. Distribution and licence

**Why it matters.** Your rule is that you don't host other people's installs. A static site holds
no one's data, which may change the answer. Your call.

| | Pros | Cons |
|---|---|---|
| A. Repo only; everyone deploys their own | Strictly within your rule | Higher barrier to trying it |
| **B. Public static site + repo** | Anyone can try it instantly; notes stay in their own browser or folder; costs nothing | Your URL is the one strangers use |
| C. Desktop download | Familiar to non-developers | Signing, notarising and updates |

Licence on all options: MIT, with your standard README, disclaimer and changelog.

**Recommendation: B,** since the site stores nothing and runs no server. Users who want sync or
MCP set those up on their own accounts.

**Your choice: B, hosted on GitHub Pages, with Drive sign-in under your Google project.**

### Security: what could go wrong, and what we do about it

| Risk | Why it matters | Measures |
|---|---|---|
| 1. Someone changes the site's code (your GitHub account taken over, or a bad update to a library we use) | Everyone using the public site runs that code, with their notes and Drive access open in the page. This is the biggest risk. | Passkey or two-factor on GitHub; changes to the main branch only through reviewed pull requests; few libraries, versions locked; automatic alerts for known flaws; a strict Content-Security-Policy so the page can only talk to Google's Drive servers |
| 2. The Google Drive access in the browser | Whoever holds it can read and change files | Google's narrowest permission (only files the app created, never the rest of your Drive); short-lived access (about an hour), nothing long-lived saved; no secret key in the app (none is needed) |
| 3. Harmful content inside a note (pasted or imported web text with hidden code) | Could run code in the page | The editor only allows Medium's small set of formatting and drops everything else; links open safely in a new tab; no raw HTML is ever shown |
| 4. A note that tries to instruct your AI ("ignore your instructions and…") | Your AI tool reads notes through MCP | The MCP server can only read notes and leave suggestions: no editing, deleting, or internet access; it can't reach files outside the notes folder; it runs on your computer only, with no open network port |
| 5. Being the named owner of the Google sign-in | Google expects a homepage and a privacy policy; may review the app | A short plain privacy page ("your notes never reach us; we store nothing"); you complete Google's steps yourself |
| 6. A custom domain left pointing nowhere later | Someone else could claim it and serve their own page | Use the free github.io address, or keep the domain renewed and pointed at the site |

Anyone who wants no trust in your copy at all can run their own from a tagged release.

### Why not GitHub for saving notes?

GitHub is the right place to **host the app** (above). As a place to **save notes** (Question 5,
option C), it's weaker on security for writers: signing in to GitHub from a browser-only app
usually means pasting a personal access token, which lasts much longer than Google's
one-hour access and is easy to give too much power by mistake. Google Drive stays the
recommended sync; GitHub saving remains a possible later option for developers, using a token
limited to one repository.

---

## 16. Name

**Why it matters.** "TK" is Medium's product. The name needs to be distinct before anything is
public, and should feel calm, not techy.

| Candidate | Feel | Note |
|---|---|---|
| To Come | Literal meaning of TK | Clear origin, a little plain |
| Margin | Where writers leave notes to themselves | Common word; check for clashes |
| Placeholder | Exactly what a gap is | Long; sounds technical |
| Later | The promise of a gap | Very common word |

None of these have been checked for clashes yet.

**Recommendation: keep a working name and choose once v1 is in use.** A name lands better once
you know how the thing feels.

**You asked to pick now.** A second shortlist from publishing terms, each checked with one quick
web search on 11 Nov (not a trademark search; domains not checked):

| Candidate | Meaning | Clash found |
|---|---|---|
| Stet | Proofreading mark for "let it stand", TK's sibling | **Yes:** an open-source, local-first editor called Stet with accept-or-dismiss AI suggestions, very close to this project. Ruled out |
| **Recto** | The right-hand page of a book, where chapters begin | None found among writing apps |
| Galley | The proof copy of a book before publication | None found as an app; a common word, also the author Ben Galley |
| Tocome | What "TK" stands for | None found; reads awkwardly ("to-comb"?) |

**Updated recommendation: Recto.** Short, unusual, clearly about books, and it nods to the
compile step (chapters open on a recto). A proper trademark and domain check comes before
anything goes public.

**You prefer a name about writing, such as OpenWrite.** Quick checks on 11 Nov:

| Candidate | Clash found |
|---|---|
| **OpenWrite** | Small: an early, inactive developer editor on Gitee (Aug 2025, no stars); and a similar-sounding GitHub project, *OpenWriter*, an AI writing surface with accept-or-reject changes |
| OpenDraft | **Yes:** an established free, open-source screenwriting app. Ruled out |
| Open Page | None found, but it's less clearly about writing |

**Updated recommendation: OpenWrite.** It says what the project is (open source, for writing),
and the clashes are small projects. To keep clear of OpenWriter, the repo, site and title
always use "OpenWrite" exactly, never "OpenWriter". A trademark and domain check still comes
before going public.

**Your choice: Stubli Writer.** It joins your own Stubli family (alongside Stubli Home), so:

- **No app clash found** for "Stubli" (quick search, 11 Nov). The nearest name is Stäubli, a
  Swiss industrial company in an unrelated field.
- **The Stubli design system is the standard** (`Stubli/docs/DESIGN.md`): Figtree, Moss green,
  calm and discreet. Question 12's serif for the writing itself fits its rule of "a serif only
  where people read up close"; it gets added to DESIGN.md as the reading face.
- **Repo name:** `stubli-writer`, MIT, with your standard README, disclaimer and changelog.
- "Writer" alone is common (iA Writer and others), which is why the Stubli prefix always goes
  with it.

---

## 17. Chapters as cards (added 11 Nov)

**Why it matters.** Writing a book means reordering. Seeing chapters as cards you can drag
(like index cards on a corkboard) makes structure visible. The question is where the order is
kept, so it survives sync, other editors and AI tools.

```
Board view of a book
┌────────────┐ ┌────────────┐ ┌────────────┐
│ 1 Arrival  │ │ 2 The tram │ │ 3 Letters  │   drag to reorder
│ Ana lands  │ │ Strike;    │ │ Ana finds  │   synopsis on each card
│ in Lisbon… │ │ Rui meets… │ │ the box…   │   gap count and characters as dots
│ ● ●   2 TK │ │ ●     0 TK │ │ ● ● ● 1 TK │
└────────────┘ └────────────┘ └────────────┘
```

| | Where the order lives | Pros | Cons |
|---|---|---|---|
| **A. A book index note** | `my-book.md` lists the chapters as links, in order | Plain Markdown anyone (and any AI) can read; a chapter can belong to more than one book; reordering changes one file only | One more file per book |
| B. A number in each chapter | `order: 3` in each chapter's header | No extra file | Moving one chapter rewrites many files (more sync conflicts) |
| C. One long manuscript | Each `##` heading is a card | One file to read or export | Huge files; slow on phones; one conflict hits the whole book |

Each chapter gets an optional one-line synopsis in its header for the card. A "read
through" view shows all chapters as one continuous text. Dragging has a keyboard alternative
(move up and down).

**Recommendation: A.**

---

## 18. Characters: where they appear, and a summary of each (added 11 Nov)

**Why it matters.** Finding every place a character appears is two problems: spotting
mentions (cheap, can be exact) and understanding them (summaries, which need AI). Under your
rules, AI can't run inside the app, so the split matters.

```
Character note: Ana.md                  Appearance map (book view)
---                                                Ch1 Ch2 Ch3 Ch4
type: character                         Ana         ●   ●   ●   ·
aliases: [Ana Sousa, Annie]             Rui         ·   ●   ●   ●
---                                     Mrs Lopes   ●   ·   ·   ●
Summary: (yours, or an AI draft
you accepted)
```

| | How | Pros | Cons |
|---|---|---|---|
| A. You list them; the app matches names | A character note with name and nicknames; the app highlights mentions in the editor and draws the map | Exact, instant, offline, free, works on the phone | Misses "she" and unlisted nicknames; summaries are yours to write |
| B. AI does everything | Your AI tool (through MCP) finds characters and writes summaries | Catches indirect mentions | Only on your computer; not live while you write; can miss or invent |
| **C. A, plus AI summaries** | Name matching in the app; a "summarise characters" routine for your AI tool drafts each summary (role, traits, arc, chapters, open questions), shown as a suggestion you accept, like gap fills | Exact where it can be, smart where it helps; nothing changes without your yes | Two parts to build |

Mentions are highlighted with a faint underline in the character's tint, switched on or off
with one key, so the writing stays calm by default.

**Recommendation: C.**

---

## 19. When does book mode ship? (added 11 Nov)

**Why it matters.** Questions 17 and 18 turn a notebook into a book-writing tool, roughly
doubling v1.

| | Pros | Cons |
|---|---|---|
| A. In v1 | Everything at once | v1 takes about twice as long; less tested at launch |
| **B. v2, with the file shapes fixed in v1** | v1 ships sooner; headers (synopsis, type: character) are designed now, so notes written in v1 work in book mode later with no conversion | Book features wait a little |
| C. Later, undecided | Most flexible | Risk of a format change later |

**Recommendation: B.**

---

## 20. Book export formats (added 11 Nov)

**Why it matters.** Self-publishing services each want specific files. Picking formats sets
what the compiler must produce and test. Requirements below are from what I knew before today
and should be checked against each service's current help pages when we build.

| Service (examples) | Ebook | Print |
|---|---|---|
| Amazon KDP | EPUB or Word | PDF interior at a set trim size, fonts embedded |
| Apple Books, Kobo | EPUB | — |
| Draft2Digital | EPUB or Word | PDF (print) |
| IngramSpark | EPUB | PDF/X print file (stricter) |

| | Produces | Pros | Cons |
|---|---|---|---|
| A. EPUB only | Ebook | Smallest job; accepted almost everywhere | No paperback |
| **B. EPUB and print PDF** | Ebook and paperback interior | Covers ebook and print on KDP and most services | Print layout is real work |
| C. B plus Word (.docx) | Also a Word file | Handy for editors and some services | A third format to keep correct |

**Recommendation: B.** Word can come later if an editor asks for it.

---

## 21. How the print PDF is made (added 11 Nov)

**Why it matters.** A paperback needs book typesetting: page numbers, running heads, chapter
openings on right-hand pages, margins for the binding, hyphenation, and no lonely lines at
the top or bottom of a page. Browsers don't do this well by themselves. *Must cost nothing and
work without installing anything, if possible.*

| | How | Pros | Cons |
|---|---|---|---|
| A. Browser print with Paged.js | The app lays out pages with CSS and you "Save as PDF" | Free, light, in the browser | Results vary by browser; weaker typesetting; no PDF/X |
| **B. Typst in the browser** | A modern typesetting engine compiled to run in the page, loaded only when you compile | Real book typesetting, consistent output, free, no install | A large one-off download (several MB) when you first compile; needs a test book to prove it |
| C. Pandoc on your Mac | A script turns the book into PDF with a typesetting tool you install | Highest quality and most control | Install and command line; computer only; not for most writers |

**Recommendation: B,** proved with a short test book before committing. A is the fallback.

---

## 22. What compiling includes (added 11 Nov)

**Why it matters.** A book is more than its chapters. And a compile should catch problems
before a reader does.

| | Includes | Pros | Cons |
|---|---|---|---|
| A. Chapters only | Chapters in order, table of contents | Simplest | You add title page, copyright and the rest elsewhere |
| **B. Book details, extra pages and a pre-flight check** | Title, subtitle, author, language, optional ISBN; title, copyright, dedication, acknowledgements and about-the-author pages; trim size (e.g. 5 × 8, 6 × 9 in); a check before export | A finished, uploadable book from one place | More screens to design |
| C. B plus a cover designer | Also builds the cover with spine | Everything in one app | Spine width depends on page count and paper; services already offer cover tools; large job |

The pre-flight check, before anything is exported:

```
Ready to compile "The Tram"?
  ✗ 3 open gaps (TK)            Ch2, Ch5, Ch5     [Show]
  ✗ 1 image below print quality  Ch3               [Show]
  ✓ Character highlights removed from the output
  ✓ Table of contents built (12 chapters)
  [Compile anyway]  [Fix first]
```

Book details are kept in the book index note's header (Question 17), so they're plain text
too. Covers, ISBN purchase and uploading to each service stay outside the app.

**Recommendation: B.** It ships with book mode in v2: EPUB first, then the print PDF once the
test book passes.

---

## 23. Character cards and connections (added 12 Nov)

**Why it matters.** Question 18 finds where each character appears. Writers also need to see
who someone is at a glance and how the people in a story relate ("Gio is James's partner",
"Ana's mother never met Rui"). The question is where those connections are kept and how
they're shown, so they stay plain text, work offline and on the phone, and cost nothing.

```
Characters/James.md                       Characters (board)
---                                       ┌──────────────┐ ┌──────────────┐
type: character                           │ James        │ │ Gio          │
aliases: [Jim]                            │ The perfect  │ │ The Italian  │
role: Lead                                │ employee…    │ │ version of…  │
---                                       │ Gio · partner│ │ James ·      │
# James                                   │ 4 notes      │ │   partner    │
The perfect employee; no family left.     └──────────────┘ │ 2 notes      │
                                                           └──────────────┘
## Connections
- [Gio](Gio.md): partner, met on the cruise
```

| | How connections are kept and shown | Pros | Cons |
|---|---|---|---|
| **A. Cards with written connections, shown both ways** | Each card is a note in `Characters/`. Connections are a list of ordinary Markdown links with a word or two. The app shows each one on both cards, so writing it once is enough. A board shows every card, with its connections as chips; choosing a card brings its connections forward | Plain Markdown any app or AI can read; one line per connection; calm, works on a phone | No drawn web of lines |
| B. A drawn web (graph) | The same notes, drawn as dots and lines you can drag | Striking for big casts | Busy, hard on a phone and for screen readers, lines cross quickly |
| C. Connections in the header | `partner: Gio` fields at the top of the file | Tidy for tools | Hidden in other apps; awkward for "met on the cruise" |

How you'd use it:

- **Make a card:** select a name in your writing and choose *Character* in the selection bar,
  or *New character* in ⌘K. The card opens with the name, a place for a summary, and
  Connections.
- **Connect:** in Connections, type a name you already have a card for; it becomes a link.
- **See them while writing:** names and aliases get a faint underline in the character's tint,
  off by default, switched with one key. Clicking one shows a small card with the summary and
  connections.
- **Where they appear:** each card lists the notes that mention them, with a line of context,
  like the Gaps panel. In book mode this becomes the chapter map of Question 18.
- **Summaries:** yours for now; later, your own AI (through MCP, no extra cost) can draft one
  as a suggestion you accept.

**Recommendation: A.** It works before book mode exists (by note), then by chapter once
chapters are cards. A drawn web (B) can come later, from the same files, if you want it.

---

## What happens next

When every row in the decision log has a choice, I'll turn it into a short build plan and wait
for your go-ahead before writing any code.
