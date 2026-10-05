# Soundscape

An Expo / React Native music companion with sound profiles, Spotify playback,
guitar tabs, listening stats, and an Electron desktop mini-player.

## Project layout

`App.tsx` at the root is the Expo entry point. It forwards to `src/App.tsx`,
which connects navigation, account settings, shared playback state, and the screens.

```text
src/
  App.tsx                  App assembly and shared state
  screens/                 SoundscapePage, PlaybackPage, GuitarPage, StatsPage
  components/              Shared controls, icons, and chord diagrams
    mini-player/           Popup, turntable visual, styles, and types
  theme/                   Palettes, accent colors, and shared UI styles
  lib/                     Spotify, Supabase client, and supporting logic
  types/                   Shared application types
tests/unit/                Unit tests
scripts/                   Browser / desktop smoke checks and fixtures
electron/                  Desktop windows and bundled asset server
supabase/                  SQL migrations and backend functions
assets/                    App icons and splash assets
```

`MiniPlayer.web.tsx` serves both Chrome and Electron. Expo selects that file
automatically on web; `MiniPlayer.tsx` supplies the native-platform fallback.
Generated exports and installers go into `dist/` and `release/`.

## Run locally

```bash
npm install
npm run start
```

## Desktop app and mini-player

Build the app bundle with `npm run desktop:export`, then run `npm run desktop`.
This opens the Electron desktop shell. `npm run desktop:build` produces a
Windows installer in `release/`. Signed releases require signing credentials.

For live development, start `npm run web -- --port 8082`, then launch the shell
from PowerShell with `$env:SOUNDSCAPE_DEV_URL='http://127.0.0.1:8082'; npm run desktop`.
Remove that environment variable to use the exported bundle again.

**Mini player** in the header opens the popup. It also opens automatically when
leaving Playback. On desktop it stays above other windows, can be moved, and
has a fixed 500 x 600 window size. Its position is remembered and clamped to
connected screens. Browser previews request the same initial dimensions,
although browser settings may permit resizing and control the window chrome.

The mini-player shares the main app's current song, record rotation, play/pause,
previous/next, and seeking. The turntable visual is decorative; use the controls
or keyboard-accessible seek bar. The mini-player has no lyrics.
Keep the main app running; minimizing it is fine.

The **X** closes only the mini-player and prevents automatic reopening for that
app session. Reopen it with the header button. The settings button beside the
header button has an **Enable mini player** option. Turning it off closes the
window and saves the preference on this device. Closing the main app closes
its player too. Phone layouts do not show mini-player controls.

Allow popups for the browser preview origin if prompted. Browser previews cannot
promise always-on-top behavior. The packaged desktop app uses
`http://127.0.0.1:43821/spotify-callback` for Spotify login. Register that redirect
in Spotify's dashboard. Export without a conflicting
`EXPO_PUBLIC_SPOTIFY_REDIRECT_URI` override. The loopback server serves only
bundled assets and the login callback.

## Checks

- `npm run typecheck`: TypeScript checking.
- `npm run test:unit`: local unit tests.
- `npm run desktop:export`: web bundle used by the desktop app.
- With the preview on port 8082, `npm run test:mini` checks Chrome and
  `npm run test:desktop` checks Electron. Both use mocked playback responses.
  Install the test browser with `npx playwright install chromium` if needed.

## Appearance

Use the moon switch in profile settings: on for dark mode (the default), off for light mode.
Signed-in users save this choice to Supabase account metadata
(`soundscape_theme`), so it loads when signing in on another device.
No database migration is required. Guests use dark mode; signing in restores
the account preference.

## Guitar tabs

The Guitar page sits immediately left of Playback. Auto-sync searches for the
current song and artist, then opens an exact public guitar-tab match (or chords
if no matching tab is available). You can select another version, change text
size, or turn auto-sync off to keep reading the selected song. Submitting a
manual search also turns auto-sync off. Playback progress does not move the tab.

The adapter reads Ultimate Guitar's public web pages, so site format changes
or provider restrictions can interrupt lookup. It supports public text Tabs
and Chords; unavailable versions link to the original site. Results are cached
for ten minutes in memory, with a source link and contributor attribution in
the reader. Song titles and artists are sent to Ultimate Guitar only when the
Guitar page is active and a search is needed.

Checks: `node --experimental-strip-types --test tests/unit/guitar.test.mjs` and
`node --experimental-strip-types scripts/guitar-smoke.mjs` (the latter uses
the live site and prints metadata only).

## Spotify setup

Run [`supabase/listening-rankings.sql`](supabase/listening-rankings.sql) once in
the Supabase SQL Editor to enable account-wide listening chart history.
Tracks and artists each keep separate snapshots for every listening time range.
The first successful visit each UTC day saves that day's chart; repeat visits,
refreshes, and other devices reuse it. Arrows compare ranks with the previous
saved day, even if you skipped several days. `New` means an entry was absent
from that earlier top 50; a dash means unchanged (or no earlier snapshot yet).
Only the latest two snapshots are retained, and recent plays remain live.
If account storage is unavailable, live rankings still load with a notice.

Spotify must allow the exact callback URL used by this app. In your Spotify
Developer Dashboard, open the app matching `EXPO_PUBLIC_SPOTIFY_CLIENT_ID` and
add the callback under **Settings → Redirect URIs**, then save.

For local web development on port 8081:

```dotenv
EXPO_PUBLIC_SPOTIFY_REDIRECT_URI=http://127.0.0.1:8081/spotify-callback
```

Put this in `.env.local`, restart Expo, and open `http://127.0.0.1:8081`.
Use the same port in all three places. Spotify does not accept `localhost`.
For hosted web builds, use the site's HTTPS origin followed by
`/spotify-callback`. Open the app on that same origin so the callback can
complete the browser session. The environment setting applies only to web;
native builds use the registered `soundscape-login://callback` callback.
Without the environment setting, web builds use the current origin followed by
`/spotify-callback`.

If Spotify displays `redirect_uri: Not matching configuration`, compare the
`redirect_uri` in the authorization URL with the dashboard entry, including the
path and trailing slash. This must be fixed in the Spotify app settings before
authorization can complete. Afterward, select **Enable stats** and approve the
listening permissions (`user-top-read` and `user-read-recently-played`).
