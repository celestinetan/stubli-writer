# Project Considerations

**Project:** a personal, open-source writing notebook built around the "TK" (to come) habit
**Name:** Stubli Writer (chosen 11 Nov; see Question 16 in the design decisions)
**Reference:** tk.xyz and its Product Hunt launch (this week), reviewed 11 Nov 2026
**Status:** Phase 1, analysis only. Nothing has been decided or built.

---

## What TK really is (from the launch post)

The landing page only shows the editor and the `@tk` gaps. The launch post from Medium's CEO
describes a bigger product in three steps:

1. **Craft.** A distraction-free editor with an inline agent, plus an "instant memory" of
   everything you've written: voice memos, drafts, Granola notes, Claude research chats, Medium
   posts, Bear and Obsidian vaults.
2. **Compound.** The agent remembers, suggests next steps and organises. Skills such as
   `/wikify` turn notes into a mini knowledge base, ideas into posts and posts into books. A
   **Daily Note** is the hub of the day. Feedback comes from readers and from the agent.
3. **Create.** Share privately or publish. An **MCP server and a Claude plugin** let Claude,
   Claude Code and other agents read and write your notes.

Pricing: free tier (notes, publishing, collaboration); Pro is $12 a month for the full agent,
skills, summaries and MCP.

The idea people praised most, from a reader comment: the AI prompts the writer, rather than the
writer prompting the AI.

**What this means for a personal version.** The agent doesn't have to live inside the app. If
your notes are a Markdown folder with a small MCP server, the agent can be **the Claude you
already use** (Claude Code or the desktop app). That brings the AI side close to zero extra
cost, keeps no key in the browser, and gives you `/wikify`-style skills as ordinary Claude
skills. The app then only needs to be an excellent, calm editor with gaps and a Daily Note.

---

## 0. The project in one paragraph

A calm, distraction-free place to write long-form and note ideas. Its signature feature is the
**gap**: when a fact, quote, link or phrase isn't ready, you type `TK` (or `@tk find the year
this law passed`) and keep writing. Every open gap, across all your notes, is listed in one
place, so you can come back and close them. An AI assistant that suggests how to fill a gap is
optional and uses your own key. Notes are plain Markdown that you own. Each person runs their
own copy at no cost.

What Medium's TK offers, and what this project changes:

| Medium's TK                         | This project                                       |
|-------------------------------------|----------------------------------------------------|
| Medium account required             | No account; it opens and you write                 |
| Notes live on Medium's servers      | Notes live on your device as Markdown              |
| AI built in, Medium pays            | AI optional, off by default, your own key          |
| "Your writing is yours" (a promise) | Your writing is yours (by design: files you hold)  |
| Closed source                       | MIT licence, each user deploys their own           |
| Imports from Evernote, Bear         | To decide (Question 13)                            |
| Hidden connections (semantic AI)    | Out of scope for v1; full-text search instead      |

---

## 1. Risks and bottlenecks

Ranked by how likely each is to hurt the project, worst first.

### Technical

1. **Browsers differ on file access.** Only Chromium browsers (Chrome, Edge, Arc, Brave) can
   open a real folder on disk (the File System Access API). Safari, including on iPad and
   iPhone, and Firefox can't. If "notes are files in a folder" is a promise, it only holds on
   desktop Chromium. Everywhere else, notes live in browser storage.
2. **Browser storage can be wiped.** Safari can delete a site's stored data after 7 days without
   a visit, unless the site is installed to the Home Screen. Clearing site data, or a private
   window, also loses notes. In a notebook, losing data is the worst failure there is. Persistent
   storage, regular backups and a visible "last backed up" note are needed from day one.
3. **Sync between devices is the hardest part.** Medium does sync for you. Without a server it's
   either missing, manual, or relies on a third party (GitHub, iCloud, your own Cloudflare
   account). Two devices editing the same note means handling conflicts.
4. **Editors are deceptively hard.** Undo, selection, text input for Chinese and Japanese
   (IME), mobile keyboards, paste from the web and long documents all break naive editors.
   Choose a proven engine rather than building one (Question 3).
5. **AI fills can be confidently wrong.** "@tk the year this law passed" invites a made-up
   answer. Any filled gap must show where the answer came from and be accepted by the writer,
   never inserted silently.
6. **Keys in the browser.** A Claude key stored in browser storage can be read by any script
   that runs on the page. One compromised dependency or browser extension could take it. It
   needs strict Content-Security-Policy, few dependencies and a clear warning.
7. **Search and AI at scale.** Thousands of notes are fine for in-browser full-text search.
   Meaning-based search ("notes like this one") needs embeddings, which means a large model
   download in the browser or a paid API. That's a v2-or-later problem.

16. **A public site is a shared point of trust.** If its code is changed (an account takeover or
    a bad library update), every user's notes and Drive access are exposed in their browser.
    Measures are listed under Question 15 in the design decisions.

### Product and business

8. **Scope creep toward Medium's feature list.** Feedback on drafts, "hidden connections" and
   importers can each be a project of their own. The distinctive part is the gap. Protect that.
9. **The name.** "TK" is Medium's product name. The publishing convention is fair to use; the
   product name, look and page wording are not. A distinct name is needed before anything is
   public.
10. **AI must not add cost (your rule, 11 Nov).** The app never calls an AI or holds a key. AI
    help comes from tools people already have (a Claude or other subscription, or a free local
    model) connecting to the notes through MCP. The trade-off: AI help is available only where
    those tools run (mostly a computer), not inside the editor or on a phone browser.
15. **Different AIs behave differently.** The same "fill my gaps" routine will give different
    quality in Claude, ChatGPT or a small local model. The routines must be written plainly
    enough for any of them, and the app must never trust a fill without your acceptance.
13. **Chasing Medium's whole product.** The launch shows memory across many sources, social
    feedback, publishing and collaboration. A personal project can't and shouldn't match that.
    The scope needs one sentence that rules most of it out (Question 1).
14. **An MCP server needs the notes on disk.** For Claude to read your notes, they must be real
    files on your Mac (or in a git repo), not only in browser storage. This ties the storage
    choice (Question 4) to the AI choice (Question 9).
11. **Open-source upkeep.** Issues, questions and requests from strangers take time. A clear
    README that sets expectations ("personal tool, shared as is") limits this.
12. **Abandonment risk for users.** If people trust it with their writing and it stops being
    maintained, plain Markdown files are their exit. That's another reason to keep the format
    plain.

---

## 2. Benefits and return

### For you

- **A writing tool shaped to how you write.** The gap list removes the main thing that stalls a
  draft: stopping to look something up.
- **Real ownership.** Markdown files open in any editor (Obsidian, iA Writer, VS Code, Bear) and
  can be versioned in git or kept in iCloud Drive.
- **No running cost.** A static site with no server and no database. AI costs only when you use
  it, cents at a time.
- **No account, no tracking, no ads.** Nothing leaves your device unless you ask the AI.
- **Your notes become context for every agent you use.** Through MCP, Claude can read your
  drafts and gaps, which is TK's Pro feature ($12 a month), at no extra cost.

### For others

- **A free, private alternative** for writers who like the TK idea but don't want a Medium
  account or a cloud notebook.
- **Forkable.** MIT licence; anyone can adapt it.

### Return on effort (estimate, not measured)

| Investment                              | Return                                               |
|-----------------------------------------|------------------------------------------------------|
| v1, no AI: about 3 to 5 working sessions | A daily-use writing tool, a public portfolio project |
| AI fills: about 1 to 2 more sessions    | The full "@tk" experience, pay per use               |
| Sync: 2 to 4 sessions, depending on choice | Writing across laptop and phone                    |
| Ongoing: about 1 hour a month           | Dependency updates, the odd issue                    |

---

## 3. Design influencers

These should drive the design, in order of weight.

1. **Context of use.** Writing long-form, close up, for 20 minutes to hours, mostly on a laptop;
   quick capture on a phone. Unlike a wall display, this is read at arm's length: comfortable
   line length (60 to 75 characters), a reading-grade serif is allowed for the text itself.
2. **Calm and discreet.** No nudges, no squiggly lines, no pop-ups while writing. The gap marker
   is the only thing that stands out. Animation only where it explains something, with a
   reduced-motion fallback.
3. **Your confirmed defaults.** One interface typeface, sentence case, colour with a job (Moss
   green for actions and states), no borders at rest, a night mode, plain-word labels that never
   blame the user.
4. **Costs nothing; each user runs their own.** Static hosting (GitHub Pages), no server you
   operate, no shared database.
5. **Your writing never leaves your device by default.** No analytics, no third-party fonts
   loaded at runtime (fonts bundled), AI calls only when asked, and only the needed text sent.
6. **Plain, portable files.** Anything the app adds (gaps, metadata) must still read cleanly in
   another Markdown editor.
7. **Keyboard first.** Writers keep their hands on the keys: shortcuts for new note, find, jump
   to next gap, close a gap.
8. **Works offline.** A notebook that needs a connection to open fails on a train.
9. **Accessible.** Visible focus, 44 px tap targets on touch, contrast that passes WCAG AA in day
   and night.

---

## 4. Impact areas

| Area                         | Effect                                                                      |
|------------------------------|-----------------------------------------------------------------------------|
| Your current notes tools     | Possible migration of drafts; an importer or a manual move is needed        |
| Your GitHub account          | A new public repo and a GitHub Pages site; standard README, MIT, changelog  |
| Stubli design system         | Could reuse its tokens (Figtree, Moss green) or define a reading variant    |
| AI billing                   | None: the app never calls an AI; your existing subscriptions or local models do the work |
| Your AI tools                | One MCP server to add to Claude or any other MCP-capable tool               |
| Backups                      | You'll need a habit or an automatic route (export, iCloud folder, or git)   |
| Devices                      | Laptop browser first; iPad and iPhone behave differently (see risk 1 and 2) |
| Your time                    | A few build sessions, then light upkeep                                     |
| Other projects (optional)    | Open gaps could later appear elsewhere, such as a count on the wall dashboard |

---

## 5. Open questions this document leaves for Phase 2

Every item above that says "to decide" is a question in `design-decisions.md`, with options and
a recommendation.
