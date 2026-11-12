# Stubli Writer

A calm, distraction-free place to write, built around the TK habit: when something isn't ready yet, type TK and keep writing.

**Live:** https://celestinetan.github.io/stubli-writer/

> Shared free, as is, with no guarantee. Keep your own backups. See the [Disclaimer & Terms of Use](#disclaimer--terms-of-use).

## What it does

1. **Write without distraction.** One quiet column on a white page in Charter. Select words for the formatting bar (bold, italic, link, code, two heading sizes, quote and pull quote); an empty line's + adds pictures with captions and sizes, code blocks, a three-dot break, a subtitle under the title and a drop cap. Markdown shortcuts work as you type.
2. **Mark gaps with TK.** Type `TK` for a quick gap, or `@tk[the year this law passed]` to say what's missing. Gaps show as small chips. The gap panel lists every open gap in every note; ⌘J jumps to the next one.
3. **Start each day on Today.** A daily note, titled with the date, ready to type.
4. **Find anything with ⌘K.** Search every note by its words (accents and capitals ignored), open a recent one, or start a new one.
5. **Keep your notes where you choose.** As Markdown files in a folder on your computer (Chrome, Edge or Arc), or in a "Stubli Writer" folder in your Google Drive, which also works on a phone and without a connection.
6. **Lose nothing from other apps.** Import Markdown from Bear, Obsidian or anywhere else. Tables, code and HTML show as protected blocks and are saved exactly as written.
7. **Write books: chapters and characters.** A book is a note that lists its chapters. Its board shows the chapters as cards (a line about each, word count, gaps and who's in it) that you drag, or move with arrows, into a new order. In a chapter, type @ once to name one of the book's characters, and every later mention is underlined; each has a card with who they are, and a map where you connect anyone to anyone by drawing a line and writing what it means. Notes outside a book are one-offs, such as articles.
8. **Find your way.** A sidebar, arranged like the Finder (right-click, rename in place, drag and drop, Undo), lists your books (each with its chapters and characters), your folders and the Trash, where notes can be put back or deleted for good. At its top it says where your notes are kept, and changing that has a way back.
9. **Make it yours.** Aa lets you choose the text size, the writing font (Charter, Literata, Source Serif or Figtree), the page colour (White, Light or Paper) and the accent colour.
10. **Install it.** On a Mac from Chrome, or on an iPhone or iPad with Share → Add to Home Screen. It opens without a connection.

## Requirements

- A current browser. Folders need Chrome, Edge or Arc on a computer; Google Drive works in any browser, including Safari on iPhone and iPad.
- For Google Drive: a Google account. Stubli Writer asks only for permission to see the files it makes itself, never the rest of your Drive.

## Privacy

Your notes never reach us. There's no server, no account, no analytics and no tracking. The app only contacts Google, and only when you use Google Drive. Details: [privacy page](https://celestinetan.github.io/stubli-writer/privacy.html).

## Built with

Checked on 12 November 2026: [Tiptap](https://tiptap.dev) 3.32 (editor), React 19, Vite 8, the [Google Drive API](https://developers.google.com/drive/api) and [Google Identity Services](https://developers.google.com/identity/oauth2/web). Fonts, all under the SIL Open Font Licence: [Charis SIL](https://software.sil.org/charis/) (the open-source form of Charter), [Literata](https://github.com/googlefonts/literata), [Source Serif 4](https://github.com/adobe-fonts/source-serif) and [Figtree](https://github.com/erikdkennedy/figtree).

Running your own copy, with your own Google sign-in: see [SETUP.md](SETUP.md). How the app is kept safe: [SECURITY.md](SECURITY.md).

## Known limits

- **Not yet on Google's verified list.** Until Google reviews the app, signing in shows a "Google hasn't verified this app" step, and only test users can sign in.
- **Editing in two places at once** (two devices, or Writer and another app on the same folder): the newer save wins and the other version is kept beside it as a "conflicted copy". Nothing is lost, but you may need to merge by hand.
- **Formatting from other apps** is kept, but some is spelled the standard way after you edit a note (for example `_italic_` becomes `*italic*`; reference links are written inline).
- **A few formats have no Markdown standard**, so they're saved as small markers that other apps show as text: a pull quote starts with `[!pull]`, a picture's size is `{.wide}` or `{.inset}`, a subtitle is a small heading under the title, and a drop cap is `dropcap: true` in the note's header.
- **No embeds.** Videos and posts from other sites aren't embedded, because they would load from those sites while you read. A pasted link stays a link.
- **Pictures from other websites** aren't shown, to keep your reading private. Pictures saved in your notes folder or Drive are.
- **No AI yet.** Help from your own AI assistant (through MCP), such as drafting a character's summary, is planned, as is exporting a book to EPUB and print PDF.
- **Characters are found by name.** "She" isn't counted, and a name that's also an ordinary word needs its "only @Name" setting.
- **Dragging chapters needs a mouse.** On a phone or with a keyboard, use the arrows on each card.

## Disclaimer & Terms of Use

Stubli Writer is shared free, for general use, and is provided **"as is", without warranty of any kind**, express or implied, including fitness for a particular purpose and that it will work without errors or keep your notes safe in every situation.

It is a writing tool, not professional advice of any kind (legal, financial, medical, technical or other).

**You use it at your own risk.** Keep your own backups of anything that matters to you. To the fullest extent the law allows, the author is not liable for any direct or indirect loss or damage, including lost or damaged notes or data, arising from using or being unable to use Stubli Writer.

By using Stubli Writer, you agree to hold the author harmless and not to bring any claim against them, including claims by third parties, arising from your use of it.

Stubli Writer is unofficial and not affiliated with, or endorsed by, Google, Bear, Obsidian, iA or any other company named here. All trademarks belong to their owners. Google Drive is used under Google's own terms and privacy policy.

Things change: versions and dates above show when they were last checked.

You may share Stubli Writer if this section stays with it, and changed versions aren't presented as the author's.

By using Stubli Writer, you accept these terms.

## Report a mistake

Write to **hello@celestinetan.com**. For a security problem, please see [SECURITY.md](SECURITY.md) first.

## Licence

The code is under the [MIT licence](LICENSE). The fonts are under the SIL Open Font Licence. The Stubli name and logo are not covered by the MIT licence.

Made by Celestine Tan in Zurich.
