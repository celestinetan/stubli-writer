"""Writes the sample notes used by the round-trip tests. Run: python3 tests/fixtures/make-notes.py

Kept as a script because some samples need exact bytes (Windows line endings, a byte-order mark,
no final newline) that editors and git like to "fix".
"""
import os

HERE = os.path.join(os.path.dirname(__file__), "notes")

NOTES = {
    "01-plain.md": "# Lisbon trip\n\nThe tram was slow.\n",
    "02-header.md": "---\ncreated: 2026-11-11\ntags: [travel, lisbon]\n---\n# Lisbon trip\n\nThe tram was TK.\n",
    "03-block-tags.md": "---\ncreated: 2026-11-11\ntags:\n  - travel\n  - \"long read\"\n---\nBody.\n",
    "04-crlf.md": "---\r\ncreated: 2026-11-11\r\n---\r\n# Windows note\r\n\r\nLine one.\r\nLine two with TK.\r\n",
    "05-bom.md": "﻿---\ncreated: 2026-11-11\n---\nA note saved with a byte-order mark.\n",
    "06-no-final-newline.md": "Last line has no newline TK",
    "07-empty.md": "",
    "08-only-header.md": "---\ncreated: 2026-11-11\n---\n",
    "09-header-dots.md": "---\ntitle: YAML style\n...\nBody after a dots closer.\n",
    "10-unclosed-header.md": "---\nthis never closes\n\nso it is all body\n",
    "11-rule-not-header.md": "Intro paragraph.\n\n---\n\nAfter a divider.\n",
    "12-unknown-fields.md": "---\ncreated: 2026-11-11\naliases: [Ana Sousa, Annie]\ncssclass: wide\nnested:\n  a: 1\n  b: [x, y]\n---\nObsidian-style header.\n",
    "13-requests.md": "The law passed in @tk[the year this law passed]. Then @TK[find the sentence about trams] again.\n",
    "14-code.md": "Real gap: TK\n\n```js\nconst TK = 1; // not a gap\n```\n\nAnd `TK` inline is not a gap.\n\n~~~\nTK in tilde fence\n~~~\n",
    "15-links.md": "See [the post](https://example.com/TK/page) and <https://tk.example/TK> and https://x.com/TK?x=1. But TK here.\n",
    "16-words.md": "ATKINS, TKO, TKs and tk are not gaps. TK, TK. (TK) \"TK\" are.\n",
    "17-cjk.md": "---\ntags: [日本語]\n---\n今日は東京へ行きました。TK を後で調べる。\n\n中文段落，还有TK。\n",
    "18-emoji.md": "Coffee ☕ first, then TK 🚋.\n\n- [ ] task TK\n- [x] done\n",
    "19-quote-list.md": "> “You don’t ride it to arrive,” Ana said.\n\n1. First\n2. Second TK\n   - nested\n",
    "20-html-comment.md": "Visible TK.\n<!-- TK hidden in a comment -->\n",
    "21-table.md": "| Year | Event |\n|---|---|\n| TK | Law passed |\n",
    "22-trailing-spaces.md": "Hard break with two spaces  \nNext line.\t\n\n\n\nMany blank lines above.\n",
    "23-tabs-indent.md": "\tIndented with a tab\n    Indented code with TK\n",
    "24-long-line.md": ("word " * 3000) + "TK\n",
    "25-front-matter-quotes.md": "---\nsynopsis: \"Ana finds the box: the letters are TK\"\ntype: 'chapter'\n---\nChapter text.\n",
    "26-reference-links.md": "A [ref link][1] with TK.\n\n[1]: https://example.com/TK\n",
    "27-image.md": "![A tram, TK](images/tram.jpg)\n\nCaption TK.\n",
    "28-empty-request.md": "An empty @tk[] is not a request, and @tk[   ] neither. @tk[multi\nline] is not one either.\n",
    "29-mixed-eol.md": "line one\r\nline two\nline three\r\n",
    "30-header-spaces.md": "---   \ncreated:    2026-11-11   \n---   \nSpaces after the dashes.\n",
    "31-many-dashes.md": "----\nnot a header (four dashes)\n----\n",
    "32-unicode-normalisation.md": "Café (precomposed) and Café (decomposed) stay as typed.\n",
}

os.makedirs(HERE, exist_ok=True)
for name, text in NOTES.items():
    with open(os.path.join(HERE, name), "w", encoding="utf-8", newline="") as f:
        f.write(text)
print(len(NOTES), "sample notes written")
