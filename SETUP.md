# Running your own copy of Stubli Writer

Stubli Writer is a static site: no server, no database. Notes stay in each person's own folder
or Google Drive. You only need your own setup for **Google Drive**; folders work without it.

## Google Drive: your own "Sign in with Google" app ID

About ten minutes in [Google Cloud Console](https://console.cloud.google.com). Google moves its
menus now and then, so names may differ slightly.

1. **Create a project**, for example "Stubli Writer".
2. **Turn on the Drive API**: APIs & Services → Library → "Google Drive API" → Enable.
3. **Sign-in screen**: Google Auth Platform → Get started. App name, your email, audience
   **External**.
4. **Permission**: Data access → add only
   `https://www.googleapis.com/auth/drive.file`
   ("See, edit, create, and delete **only** the specific Google Drive files you use with this
   app"). Never the full `auth/drive`: that would give the app everyone's whole Drive.
5. **Test users** (while the app is in testing): Audience → add the Google addresses that will
   sign in.
6. **App ID**: Clients → Create client → **Web application**. Under *Authorised JavaScript
   origins*, add the address your copy runs at (for example `https://you.github.io`, and
   `http://127.0.0.1:5179` for trying it locally). No redirect addresses.
7. Put the **Client ID** in `src/config.ts`, or build with
   `VITE_GOOGLE_CLIENT_ID=… npm run build`. It isn't a secret. Never put a client *secret*
   anywhere in this project; it isn't needed.

## Building

```bash
npm ci --ignore-scripts
npm test
npm run build
```

The site is in `dist/`. The included GitHub Pages workflow (`.github/workflows/deploy.yml`) runs
only when started by hand.
