import { WELCOME_PATH, welcomeNote } from "./welcome";

/** Sample notes for trying Stubli Writer without a folder. Made-up text; no real people. */

const TRAM = `---
created: 2026-11-11
tags: [travel]
---
# The tram to Belém

#### A morning on the 15, from Figueira to the monastery

The 15 left Praça da Figueira at TK, full of **school children** and one man carrying a cello case like a passenger of its own. Nobody looked up when the doors jammed.

> [!pull]
> “You don’t ride it to arrive,” Ana said. “You ride it to be somewhere in between.”

## The monastery

By the monastery the light had gone soft and yellow. The pastry shop opened in @tk[the year it opened], and the queue still bent around the corner.

- Pastries, still warm
- The *queue*
- Tickets for the way back

| Stop | Time |
|---|---|
| Figueira | 15:42 |
| Belém | TK |

---

Select some words to see the formatting bar. An empty line shows a + for pictures, code, a break and a drop cap.
`;

const IDEAS = `---
created: 2026-11-08
tags: [ideas]
---
# Essay ideas

- Why trams make people talk to strangers
- Bakeries as clocks: every neighbourhood sets its morning by one
- @tk[a third idea about walking]

The first one needs the figure for how many people ride the 28 each day: TK.
`;

const LETTERS = `---
created: 2026-11-02
---
# Ana's letters

Ana found the box of letters in the attic on a Sunday. The oldest one was dated TK, written in a hand she didn't know and signed only Marta.

She read them in order, slowly, the way you eat the last of something.
`;

const ANA = `---
type: character
created: 2026-11-02
---
# Ana

Role: Lead
Also called: Annie

Rides the 15 to be somewhere in between. Found a box of letters in the attic and can't stop reading them.

## Connections

- Marta: wrote the letters, long before Ana was born
- Teresa: mother
- Rui: brother, the one who kept the attic key
`;

const MARTA = `---
type: character
created: 2026-11-02
---
# Marta

Role: The letter writer

A name at the bottom of every letter in the box, in a hand nobody in the family knows.

## Connections

`;

const TERESA = `---
type: character
created: 2026-11-02
---
# Teresa

Role: Ana's mother

Never mentions the letters, and changes the subject when anyone else does.

## Connections

`;

const RUI = `---
type: character
created: 2026-11-02
---
# Rui

Role: Ana's younger brother

Lives in Porto. Kept the key to the attic for years without saying why.

## Connections

`;

const BOOK = `---
type: book
created: 2026-11-10
---
# Lisbon stories

Short pieces about the city, in reading order.

## Chapters

1. [The tram to Belém](../The%20tram%20to%20Bel%C3%A9m.md)
2. [Ana's letters](../Stories/Ana's%20letters.md)
`;

export const SAMPLE_NOTES: Record<string, string> = {
  [WELCOME_PATH]: welcomeNote(new Date(2026, 10, 1)),
  "The tram to Belém.md": TRAM,
  "Essay ideas.md": IDEAS,
  "Stories/Ana's letters.md": LETTERS,
  "Books/Lisbon stories/Characters/Ana.md": ANA,
  "Books/Lisbon stories/Characters/Marta.md": MARTA,
  "Books/Lisbon stories/Characters/Teresa.md": TERESA,
  "Books/Lisbon stories/Characters/Rui.md": RUI,
  "Books/Lisbon stories.md": BOOK,
};
