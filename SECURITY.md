# Security

## Reporting a problem

If you find a way Stubli Writer could expose someone's notes or Google Drive, please write to
**hello@celestinetan.com** before telling anyone else, so it can be fixed first. Include what you
did and what happened. You'll get a reply within a week.

## How Stubli Writer protects your notes

- **No server.** Notes stay in your own folder or your own Google Drive. Nothing passes through
  anyone else.
- **The narrowest Google permission.** Only the files Stubli Writer makes itself (`drive.file`),
  never the rest of your Drive. Sign-in lasts about an hour and is kept in memory only.
- **A strict Content-Security-Policy.** The page can only load its own files, Google's sign-in
  (`accounts.google.com`) and Drive (`www.googleapis.com`). No inline code, no `eval`.
- **Notes can't run code.** Links to `javascript:` addresses are refused, HTML in a note is shown
  as text, and pictures from other websites aren't loaded.
- **Careful updates.** Library versions are locked, installed without running their install
  scripts, and only updated after two weeks, by hand, after the tests pass. Build tools on GitHub
  are pinned to exact versions.

The details, and what each check guards against, are in [docs/security.md](docs/security.md).
