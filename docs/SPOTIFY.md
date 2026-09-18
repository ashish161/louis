# Spotify setup (this fork)

Louis uses your Spotify **Client ID** and **Client secret** for spotDL (playlist → YouTube matching). **Connect Spotify** (optional) lists your playlists; it needs a **Redirect URI** registered in the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard).

## Easiest: skip Connect (no redirect URI needed for daily use)

If the dashboard will not accept your redirect URL, you can still use Spotify playlists:

1. Create an app in the dashboard and copy **Client ID** + **Client secret** into `.env`.
2. If the create form **requires** a redirect URI, add any **HTTPS** URL you control (see below) — you do not have to use **Connect** if you paste playlist links instead.
3. In Louis Search, **paste** a Spotify playlist URL (e.g. `https://open.spotify.com/playlist/…`) and press Search.

Private playlists need **Connect** or a playlist you can open while logged in on the web.

## Redirect URI rules (2025+)

| URI | Dashboard |
| --- | --- |
| `http://localhost:…` | **Rejected** |
| `http://127.0.0.1:4000/…` | Allowed by Spotify docs; some accounts/UI builds **refuse to save** HTTP entirely |
| `https://127.0.0.1:4000/…` | Usually **accepted** (local TLS — see below) |
| `https://your-tunnel.trycloudflare.com/…` | **Accepted** (Cloudflare quick tunnel) |

Louis callback path: **`/api/spotify/auth/callback`**

Examples:

- `https://127.0.0.1:4000/api/spotify/auth/callback` (local HTTPS + mkcert)
- `https://YOUR-SUBDOMAIN.trycloudflare.com/api/spotify/auth/callback` (tunnel)

Open Louis at the **same origin** as the redirect URI (same host, scheme, and port).

Check what Louis uses: **GET `/api/spotify/auth/status`** → `redirectUri`, or expand **Spotify** in Search (shown when configured).

## Option A — Local HTTPS with mkcert (recommended if HTTP is blocked)

```bash
brew install mkcert
mkcert -install
cd /path/to/louis
mkcert 127.0.0.1
```

In `.env`:

```bash
LOUIS_SPOTIFY_CLIENT_ID=...
LOUIS_SPOTIFY_CLIENT_SECRET=...
LOUIS_DEV_TLS_KEY=./127.0.0.1-key.pem
LOUIS_DEV_TLS_CERT=./127.0.0.1.pem
LOUIS_SPOTIFY_REDIRECT_URI=https://127.0.0.1:4000/api/spotify/auth/callback
LOUIS_COOKIE_SECURE=false
```

```bash
npm run dev
```

Open **https://127.0.0.1:4000** (accept the mkcert trust prompt once).

In the Spotify Dashboard → your app → **Settings** → **Redirect URIs**, add exactly:

`https://127.0.0.1:4000/api/spotify/auth/callback`

Then use **Connect Spotify** in Louis.

## Option B — Cloudflare quick tunnel (HTTPS, no mkcert)

Terminal 1:

```bash
npm run dev
```

Terminal 2:

```bash
cloudflared tunnel --url http://127.0.0.1:4000
```

Copy the `https://….trycloudflare.com` host. In `.env`:

```bash
LOUIS_SPOTIFY_REDIRECT_URI=https://YOUR-HOST.trycloudflare.com/api/spotify/auth/callback
```

Restart Louis, register that **exact** URI in the Spotify Dashboard, then open Louis at **`https://YOUR-HOST.trycloudflare.com`** (not `127.0.0.1`) and **Connect**.

## Option C — HTTP loopback (if your dashboard still allows it)

Register:

`http://127.0.0.1:4000/api/spotify/auth/callback`

Open **http://127.0.0.1:4000**. Louis maps `localhost` → `127.0.0.1` for OAuth when redirect URI is not pinned.

If you see **“This redirect URI is not secure”** and **Save** is disabled, use Option A or B instead.

## Desktop app (port 4010)

Register:

`https://127.0.0.1:4010/api/spotify/auth/callback`

(or HTTP loopback if your dashboard allows it). Set `LOUIS_SPOTIFY_REDIRECT_URI` to match.

## Troubleshooting

- **INVALID_CLIENT / redirect_uri mismatch** — Dashboard URI must match Louis `redirectUri` byte-for-byte (scheme, host, port, path).
- **Connect works but Louis shows disconnected** — You opened Louis on a different origin than the redirect (e.g. tunnel URL vs `127.0.0.1`).
- **spotDL missing** — `pipx install spotdl` or `pip3 install --break-system-packages spotdl`.
