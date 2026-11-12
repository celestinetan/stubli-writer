# Security review (milestone 7, 12 November 2026)

The six risks from design decision 15, what is in place for each, and what's still to do.

| # | Risk | In place | Tested by | Still to do |
|---|---|---|---|---|
| 1 | Someone changes the site's code (account takeover, a bad library update) | Strict Content-Security-Policy: only the site's own files, `accounts.google.com/gsi/*` and `www.googleapis.com`; no inline code or `eval`. Library versions locked (`save-exact`), installed with `--ignore-scripts`, updated only after 14 days by reviewed pull requests (Dependabot). GitHub Actions pinned to exact commits. The deploy runs `npm audit` and every test first, and only when started by hand. | `tests/unit/mode.test.ts`, `tests/e2e/security.spec.ts` (policy, no inline code, only Google's hosts in the code) | On GitHub, once the repo exists: passkey or two-factor sign-in, protect the main branch (changes through pull requests only), turn on Dependabot alerts and secret scanning. See the list below. |
| 2 | Google Drive access in the browser | Only `drive.file` (files the app made). Access token in page memory only, about an hour, never stored. No client secret anywhere. | `tests/unit/drive-store.test.ts`, `tests/e2e/drive.spec.ts` | Google may review the app before strangers can sign in (milestone 8). |
| 3 | Harmful content inside a note | Medium's formatting only; HTML shown as text in protected blocks; `javascript:` links refused; pasted HTML trimmed; outside pictures not loaded. | `tests/e2e/security.spec.ts` (harmful note), `tests/e2e/editor.spec.ts` (paste) | — |
| 4 | A note that tries to give instructions to an AI | Not built yet (v1.5, MCP). | — | The MCP server will be read-and-suggest only, inside the notes folder, with no network access. |
| 5 | Being the named owner of the Google sign-in | A plain privacy page (`public/privacy.html`), linked from the start screen and the app. | `tests/e2e/install.spec.ts` (privacy page, also offline) | Celestine reviews the privacy wording before it's public (it makes public claims). |
| 6 | A custom domain left pointing nowhere | Not using a custom domain. | — | Use the free `github.io` address, or keep any domain renewed. |

## Also checked

- **The offline copy** (service worker) handles only the site's own files, never Google's.
- **Addresses in the built code** other than Google's are text only: XML namespaces
  (`www.w3.org`) and links inside library error messages (`react.dev`, `prosemirror.net`,
  `github.com`). None is contacted.
- **Known flaws in libraries:** `npm audit` found 0 on 12 November 2026.

## GitHub settings to turn on when the repo is created

1. Account: a passkey, or two-factor sign-in.
2. Settings → Branches → protect `main`: require a pull request before merging; no force pushes.
3. Settings → Code security: Dependabot alerts and security updates; secret scanning with push
   protection.
4. Settings → Actions → General: allow only actions from GitHub and verified creators; read-only
   default permissions for the workflow token.
5. Settings → Pages: deploy from GitHub Actions; enforce HTTPS.
