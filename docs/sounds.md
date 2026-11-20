# Typing sounds

The four typing sounds are recordings of real keyboards. Each was released by its author under
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) (no rights reserved); the licence was read on each
source page on 20 November 2026. CC0 asks for no credit, but here it is, with thanks.

| Sound in the app | Keyboard | Recording | Author |
| --- | --- | --- | --- |
| Creamy | Corsair K95, Cherry MX Red switches | [Keyboard clicking typing Cherry Red Mechanical](https://freesound.org/people/handygaber/sounds/499773/) | handygaber |
| Thocky | Happy Hacking Keyboard Professional Hybrid, Topre switches | [Keyboard Typing 2 (HHKB, Topre)](https://freesound.org/people/grcekh/sounds/546033/) | grcekh |
| Clacky | Gateron Black switches | [Gateron Black Switches Sound](https://freesound.org/people/el_boss/sounds/643559/) | el_boss |
| Poppy | Cherry MX Clear switches | [Mechanical keyboard clicking. Different keys (4)](https://freesound.org/people/humi74/sounds/412926/) | humi74 |

The names Creamy, Thocky, Clacky and Poppy are Stubli Writer's own matching, not the authors' words. No free recording
described as "poppy" was found; Cherry MX Clear is the nearest in character. The matching was made by measuring
each recording's overall pitch (Topre lowest, then Cherry MX Red, with Cherry MX Clear and Gateron Black the brightest),
not by ear.

## How the files were made

- Creamy, Clacky and Poppy use the single presses and releases already cut from those recordings by
  [Mechanify](https://github.com/abraraltaf92/mechanify) (its code is MIT; the recordings stay CC0).
- Thocky was cut from Freesound's preview of the Topre recording: keystrokes that stand alone, with nothing typed for
  175 ms after them. They include the key coming back up, so Thocky has no separate release sounds.
- `scripts/build-sounds.py` trims each stroke, evens out loudness, and packs each keyboard into one mono 16-bit,
  32 kHz WAV in `public/sounds/` (210 to 360 KB each). Where each stroke sits is listed in `src/app/keyclips.ts`.

## In the app

A keyboard's file is fetched from the app's own address only when that sound is chosen, then kept by the offline copy.
Nothing is fetched while the sound is Off. Nothing typed is recorded or sent anywhere.
