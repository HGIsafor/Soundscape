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

## Spotify login and listening stats

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
