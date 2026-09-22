# bt-turntable

Expo React Native skeleton for a turntable sound profile controller app.

## What this includes

- Simple profile UI (Warm / Flat / Bright)
- Visual tone meters for bass, mid, treble, ambience, and output
- Placeholder state flow for future connectivity integration

> Bluetooth and hardware connectivity are intentionally not implemented yet.

## Run locally

```bash
npm install
npm run start
```

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

Checks: `node --experimental-strip-types --test lib/guitar.test.mjs` and
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
