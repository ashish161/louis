# Louis (fork) — Yoto MYO + YouTube, with Spotify import

![Louis](docs/images/louis-readme-banner.webp)

Fork of [stuartromanek/louis](https://github.com/stuartromanek/louis) with **Spotify playlist import** via [spotDL](https://github.com/spotDL/spotify-downloader). Tracks are matched to YouTube, then downloaded and saved to [Yoto](https://yotoplay.com/) through Louis’s normal flow.

Louis turns YouTube into audio playlists for your Yoto. Search or paste a link, arrange tracks, then Update — Louis downloads and transcodes. Linking a physical **Make Your Own (MYO)** card happens in the Yoto app, not here.

Self-hosted **Nuxt** server app. Yoto OAuth, Spotify OAuth, and YouTube audio download need a long-running server process — a static export cannot power those flows.

**Personal use only.** You are responsible for complying with [YouTube’s Terms of Service](https://www.youtube.com/t/terms), Spotify’s terms, and applicable law when downloading audio.

## Official site install vs this fork

| | [louis.romanek.us](https://louis.romanek.us/) (official) | **This repo** (`ashish161/louis`) |
| --- | --- | --- |
| Desktop DMG / EXE | Yes | Build from source (see below) |
| YouTube → Yoto | Yes | Yes |
| Spotify playlists via spotDL | **No** | **Yes** |

The app from the website will **not** pick up Spotify support. For Spotify, run **this checkout** (recommended: local Node), or build a desktop installer from it. You can keep the official app installed; use this fork separately when you need Spotify.

Upstream site / docs: [louis.romanek.us](https://louis.romanek.us/) · [upstream repo](https://github.com/stuartromanek/louis)

## Features

- Search YouTube and preview audio — **YouTube Data API** when configured (faster typed search, optional content filtering), otherwise bundled **yt-dlp**. Paste a video, Shorts, playlist, or channel URL in Search to load it; check rows to add them together
- **Spotify playlists:** Connect Spotify or paste a playlist/album/track URL — [spotDL](https://github.com/spotDL/spotify-downloader) finds YouTube matches; Louis downloads/transcodes on Update like any other track
- Browse your Yoto playlists. **New** names a playlist and creates it on Yoto right away (empty, or with tracks already picked in Search)
- Drag-and-drop playlist editing (desktop); phone Search / Library flow with Add to playlist; **Add to Home**; phone Menu can Update every pending playlist at once
- Playlist covers: generated art on create; **Artwork** to generate, upload, or crop a 5×7 cover. Rename or delete from the playlist menu
- Auto-split long YouTube sources (>55 min) into Part tracks; trim intros/outros before save
- Save / Update to Yoto with download and transcode progress; optional normalize for new YouTube extracts
- Per-track 16×16 art (Yoto icon library, [yotoicons.com](https://yotoicons.com/), upload, or draw)

## Choose how to run (this fork)

| You want… | Start here |
| --------- | ---------- |
| **Spotify + local use (recommended)** | [Quick start (local)](#quick-start-local-with-spotify) |
| Desktop app built from this fork | [Build desktop from this repo](#build-desktop-from-this-repo) |
| Docker on a NAS / homelab | [Docker](#docker) |
| Home Assistant on your LAN | [Home Assistant](#home-assistant) |
| Official installers (no Spotify) | [louis.romanek.us](https://louis.romanek.us/#install) |

## Quick start (local, with Spotify)

### 1. Prerequisites

- **Node.js 22+**
- **[yt-dlp](https://github.com/yt-dlp/yt-dlp)** and **[ffmpeg](https://ffmpeg.org/)** on `PATH`
- **[spotDL](https://github.com/spotDL/spotify-downloader)** on `PATH` — e.g. `pipx install spotdl` or `pip3 install --break-system-packages spotdl`
- A **Yoto** client ID (bundled or from [yoto.dev](https://yoto.dev/get-started/start-here/))
- A **Spotify** app from [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)

### 2. Clone and configure

```bash
git clone https://github.com/ashish161/louis.git
cd louis
cp .env.example .env
npm install
```

Edit `.env` (minimum for Spotify):

```bash
LOUIS_YOTO_CLIENT_ID=PK00MDKCVwWvOG8o3px3qSl57FhfUZxm
# or your own yoto.dev public client ID

LOUIS_SPOTIFY_CLIENT_ID=your_spotify_client_id
LOUIS_SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
```

**Spotify redirect URI:** the [Developer Dashboard](https://developer.spotify.com/dashboard/create) often **only accepts HTTPS** (and rejects `localhost`). You have two practical paths:

| Goal | What to do |
| ---- | ---------- |
| **Paste playlist URLs only** (no Connect) | Client ID + secret in `.env` is enough. If create-app forces a redirect URI, add any HTTPS URL (see [docs/SPOTIFY.md](docs/SPOTIFY.md)) — you never have to click Connect. |
| **Connect + list your playlists** | Use **HTTPS** redirect — easiest: [local mkcert](docs/SPOTIFY.md#option-a--local-https-with-mkcert-recommended-if-http-is-blocked) or [Cloudflare tunnel](docs/SPOTIFY.md#option-b--cloudflare-quick-tunnel-https-no-mkcert). |

Example (local HTTPS — register this in the dashboard):

```bash
LOUIS_DEV_TLS_KEY=./127.0.0.1-key.pem
LOUIS_DEV_TLS_CERT=./127.0.0.1.pem
LOUIS_SPOTIFY_REDIRECT_URI=https://127.0.0.1:4000/api/spotify/auth/callback
```

Full walkthrough: **[docs/SPOTIFY.md](docs/SPOTIFY.md)**. Louis shows the exact `redirectUri` under **Spotify** in Search when credentials are set.

### 3. Run

```bash
npm run dev
```

Open Louis at the same URL as your redirect (e.g. **https://127.0.0.1:4000** with mkcert, or **http://127.0.0.1:4000** if your dashboard still allows HTTP loopback).

1. Connect **Yoto** as usual.
2. **Paste a Spotify playlist URL** in Search, **or** expand **Spotify** → **Connect** (HTTPS redirect required).
3. Select tracks → add to a Yoto playlist → **Update**.

Public playlist URLs work with client ID/secret alone. **Connect** needs a saved **HTTPS** redirect URI for most new Spotify apps.

Resolve results are cached ~10 minutes per playlist so spotDL is not re-run on every click.

## Build desktop from this repo

Official site DMGs do **not** include Spotify. To get a Mac/Windows app with this fork’s features:

```bash
npm install
cp .env.example .env   # Spotify keys still needed at runtime / in app data
npm run desktop:build:mac   # or desktop:build:win / desktop:build:host
```

Desktop OAuth uses port **4010**. Register Spotify redirect:

`http://127.0.0.1:4010/api/spotify/auth/callback`

and set `LOUIS_SPOTIFY_REDIRECT_URI` (or the desktop equivalent) to that URI. Details: [docs/DESKTOP.md](docs/DESKTOP.md).

Installers from a local build are **unsigned** (Gatekeeper / SmartScreen may warn).

## Docker

This fork’s image build installs **spotDL** alongside yt-dlp and ffmpeg.

```bash
git clone https://github.com/ashish161/louis.git
cd louis
cp .env.example .env
# Set LOUIS_YOTO_CLIENT_ID and LOUIS_SPOTIFY_CLIENT_ID / SECRET
docker compose up -d --build
```

Open Louis at [http://localhost:4000](http://localhost:4000) (or `http://<host-ip>:4000`). Register the matching Spotify redirect URI. Health: `GET /api/health`.

Prebuilt images on Docker Hub / GHCR are from **upstream** and do **not** include Spotify — build from this repo for the fork.

**Homelab notes:** [docs/HOSTING.md](docs/HOSTING.md).

## Home Assistant

Upstream add-on images do not include Spotify. To use this fork on HA, build/push your own image from this repo and point the add-on at it, or run Docker Compose on the host instead.

Upstream HA install (no Spotify): add repo `https://github.com/stuartromanek/louis` in Supervisor. Docs: [homeassistant/louis/DOCS.md](homeassistant/louis/DOCS.md).

## Self-host details

### 1. Yoto client ID

Louis ships a **public** PKCE client ID (not a secret): `PK00MDKCVwWvOG8o3px3qSl57FhfUZxm`. Paste it into `LOUIS_YOTO_CLIENT_ID` when you open Louis at a redirect already registered on Louis’s Yoto app. There is **no** silent fallback if the env var is empty.

| Redirect (exact) | Client |
| ---------------- | ------ |
| `http://127.0.0.1:4010/api/yoto/auth/callback` | Louis bundled (desktop) — see [DESKTOP.md](docs/DESKTOP.md) |
| `http://homeassistant.local:4000/api/yoto/auth/callback` | Louis bundled (HA default) |
| `http://localhost:4000/api/yoto/auth/callback` | Usually needs **your own** yoto.dev client unless you register it |

For any **other** origin (NAS IP, custom hostname, HTTPS), create your **own** public client at [yoto.dev](https://yoto.dev/get-started/start-here/) and register that exact `/api/yoto/auth/callback`.

| Setting | Value |
| ------- | ----- |
| **Allowed Callback URLs** | `http://<host>:4000/api/yoto/auth/callback` or `https://your-domain/api/yoto/auth/callback` |
| Scopes | `offline_access user:content:view user:content:manage user:icons:manage` |

Ports: desktop OAuth **4010**; Docker / local `npm run dev` **4000**.

### 2. YouTube API (recommended)

A YouTube Data API v3 key is **recommended** for faster search. In [Google Cloud Console](https://console.cloud.google.com/): enable YouTube Data API v3, create an API key (Public data). Set `LOUIS_YOUTUBE_API_KEY`. Leave unset to search with yt-dlp only.

### 3. Spotify + spotDL

| Variable | Notes |
| -------- | ----- |
| `LOUIS_SPOTIFY_CLIENT_ID` | Spotify Developer Dashboard client ID |
| `LOUIS_SPOTIFY_CLIENT_SECRET` | Client secret (local only — never commit) |
| `LOUIS_SPOTIFY_REDIRECT_URI` | Optional pin; default `${origin}/api/spotify/auth/callback` |
| `LOUIS_SPOTDL_PATH` | Optional. Default `spotdl` |

Flow: Spotify metadata → `spotdl save --preload` (YouTube URLs) → Louis save uses yt-dlp + ffmpeg like other tracks.

### 4. Environment reference

Copy [`.env.example`](.env.example). Prefer `LOUIS_*` names (legacy `NUXT_*` still works; `LOUIS_*` wins).

#### Required

| Variable | Notes |
| -------- | ----- |
| `LOUIS_YOTO_CLIENT_ID` | Public PKCE client ID |

#### Yoto

| Variable | Notes |
| -------- | ----- |
| `LOUIS_YOTO_REDIRECT_URI` | Optional pin; unset = request origin |
| `LOUIS_COOKIE_SECURE` | Cookie `Secure` flag. Docker defaults `false` (LAN HTTP) |

#### YouTube / audio

| Variable | Notes |
| -------- | ----- |
| `LOUIS_YOUTUBE_API_KEY` | Recommended Data API key |
| `LOUIS_YOUTUBE_SAFE_SEARCH` | `none` / `moderate` (default) / `strict` |
| `LOUIS_AUDIO_WORK_DIR` | Default `/data/audio` in Docker |
| `LOUIS_YTDLP_PATH` | Optional pin (default `yt-dlp`) |
| `LOUIS_YTDLP_COOKIES_FILE` | Optional Netscape `cookies.txt` for blocked downloads |

#### Advanced

| Variable | Notes |
| -------- | ----- |
| `LOUIS_ENABLE_DEBUG_ROUTES` | `true` enables debug API routes |

### 5. Deploy constraints

- **Single instance** — save-job progress is in memory
- **HTTPS** — set `LOUIS_COOKIE_SECURE=true` behind TLS; keep `false` for plain LAN HTTP
- **Persistent disk** — recommended for `LOUIS_AUDIO_WORK_DIR`

## Native development (no Spotify extras)

Same as [Quick start](#quick-start-local-with-spotify); Spotify vars and spotDL are optional if you only use YouTube.

```bash
npm install
cp .env.example .env
npm run dev
```

Dev server: port **4000**. Tests: `npm test`.

Production without Docker:

```bash
npm run build
npm run start
```

## License & notices

MIT — see [LICENSE](LICENSE).

Fonts (LT Saeada, self-hosted), OpenMoji icons, and [SND](https://snd.dev/) UI sounds are used; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Security reports: [SECURITY.md](SECURITY.md).

Upstream project: [stuartromanek/louis](https://github.com/stuartromanek/louis).
