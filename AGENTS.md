# AGENTS.md

Project context for AI coding agents working in this repository. Read this before making changes.

## What this project is

**Louis** (a fork of [stuartromanek/louis](https://github.com/stuartromanek/louis)) is a self-hosted Nuxt web app that turns YouTube and Spotify into audio playlists for the **Yoto** player — Yoto's "Make Your Own" (MYO) audio cards. You search or paste a link, arrange tracks, and **Update** to have the server download and transcode playback that gets linked to a physical MYO card (linking happens in the Yoto app itself).

This fork adds **Spotify playlist import** via [spotDL](https://github.com/spotDL/spotify-downloader): Spotify metadata is matched to YouTube URLs, then downloaded/transcoded through the normal Louis flow.

It ships in four forms, all built from this one codebase:
1. **Self-hosted Nuxt/Nitro server** (local Node or Docker) — `npm run dev` / `npm run build && npm run start`
2. **Electron desktop app** (`desktop/`) — same Nitro server, port **4010** for OAuth
3. **Docker image** (`Dockerfile`, `docker-compose.yml`)
4. **Home Assistant add-on** (`homeassistant/louis/`)

Personal use only; users are responsible for YouTube / Spotify terms when downloading audio.

## Stack

- **Nuxt 4.4.x** (Nitro 2.13.x, Vite 7.x, Vue 3.5.x) — `compatibilityDate: '2025-07-15'`
- **Tailwind CSS 4** via `@tailwindcss/vite`; `@dnd-kit/vue`, `lottie-web`, `pkce-challenge`
- **Node >= 22**, ESM (`"type": "module"`), **TypeScript** 
- **Electron 37** (desktop shell) + electron-builder for packaging
- No ESLint/Prettier/config formatting tooling is configured. Follow existing patterns by eye.

## Commands

```bash
npm run dev                 # dev server → http://127.0.0.1:4000 (LOUIS_DEV_PORT to override)
npm run build && npm run start   # production build + serve .output
npm test                    # Node built-in test runner, see Testing below
npm run generate / preview  # static export (cannot power OAuth/download flows)
npm run desktop:build:mac   # Electron DMG (darwin-arm64 + x64)
npm run desktop:build:win   # Electron NSIS (win32-x64)
npm run desktop:build:host  # dev-host Electron app
npm run release             # release-it version bump (see docs/RELEASE.md)
```

`postinstall` runs `nuxt prepare` (regenerates `.nuxt/`, tsconfig refs, imports).

## Directory layout

- `app/` — Vue client. `components/` (subfolders: `myo-editor`, `youtube-picker`, `layout`, `track-art`, `track-trim`, `splash`, `design-system`, `ui`, `desktop`, `dev`), `composables/use*.ts`, `pages/index.vue` (the app) + `pages/design.vue` (design-system playground), `plugins/*.client.ts` (PWA install, UI sounds), `utils/`.
- `server/` — Nitro server. Auto-imported utils in `server/utils/` (audio/transcode pipeline, yt-dlp, YouTube, Yoto + Spotify OAuth). API routes in `server/api/` (`yoto/`, `youtube/`, `spotify/`, `tools/`). Boot plugins in `server/plugins/`.
- `shared/` — **polyglot-shared** code used by client, server, desktop, and unit tests.
  - `myo-editor/` — pure domain logic (save plans, track matching, trimming/splitting, artwork, Yoto payloads) with colocated `.test.ts` files.
  - `louis-env.mjs` — the env-binding registry (see "Environment & config").
  - `.mjs` modules (`ytdlp-js-runtime-probe.mjs`, `spotdlMap.ts`, `spotifyUrl.ts`, etc.) kept out of `server/` so pure-Node unit tests never import Nitro.
- `desktop/` — Electron shell: `main.mjs`, `preload.cjs`, `configStore.mjs`, `js-runtime.mjs` (Electron-as-node yt-dlp shim), `scripts/` (binary fetch, version sync, build host). Spawns/builds the same Nitro server.
- `homeassistant/` — HA add-on manifest, `run.sh`, Dockerfile.
- `deploy/`, `docs/` — deployment + setup docs (`SPOTIFY.md`, `DESKTOP.md`, `HOSTING.md`, `RELEASE.md`).

## Shared-code import convention (important)

- From **server** or **app** code, import shared modules with the **`#shared/` alias**, never with relative `../../shared/...` paths:
  - `import { parseYtdlpJsRuntimeSpec } from '#shared/ytdlp-js-runtime-spec.mjs'`
  - `#shared` is the only reliable path when passing `.mjs` files through the Nuxt/Nitro bundler.
- Relative `../../shared/...` imports of `.mjs` files get **externalized by Nitro with a broken absolute path** (`Cannot find module '/shared/x.mjs'`). Some older `.ts` relative imports still exist, but new code should use `#shared`.
- **Colocated test files** inside `shared/` import their neighbor modules with relative `./` paths (they run under plain Node, not the bundler).
- Server utils use bare relative imports (`./x`, `../utils/x`).

## Module-format constraints

- ESM everywhere. `"type": "module"`; Node built-ins imported as `node:fs`, `node:child_process`, etc.
- Tests compile with plain Node **type stripping** (no esbuild/babel). Runtime-TS syntax that needs a transform is **forbidden**: no `enum`, `namespace`, parameter properties, or decorators. Use `interface`/`type`/`const` unions instead.
- Relative imports in shared/server code generally use an explicit **`.ts` extension** (`from './types.ts'`), required for `node --experimental-strip-types`. `#shared`-alias imports may omit the extension (resolved by bundler).
- `.mjs` files use JSDoc types and plain JS so they can run/test under vanilla Node.

## Testing

Run with `npm test`. There is **no vitest/jest** — the Node built-in test runner with type stripping:

```bash
node --experimental-strip-types --test shared/*.test.ts shared/**/*.test.ts server/**/*.test.ts desktop/*.test.mjs desktop/**/*.test.mjs
```

- Tests are **colocated** as `*.test.ts` / `*.test.mjs` next to their source (`buildSavePlan.test.ts`, `spotdlMap.test.ts`, `configStore.test.mjs`, ...).
- Use `import { test } from 'node:test'` and `assert` from `node:assert/strict`.
- Shared modules are tested under plain Node precisely because they must not pull in Nitro/Vue.

## Environment & config (critically important)

- **Prefer `LOUIS_*` env vars.** Legacy `NUXT_*` still works as fallback; when both are set, `LOUIS_*` wins. `.env.example` documents every variable.
- **The single source of truth for bindings is `shared/louis-env.mjs` → `LOUIS_ENV_BINDINGS`.** When adding a config value you must update:
  1. `LOUIS_ENV_BINDINGS` in `shared/louis-env.mjs`,
  2. `runtimeConfig` defaults in `nuxt.config.ts` (via `louisRuntimeConfigDefaults()`),
  3. `.env.example` doc comment.
- Runtime config is applied/aliased in three coordinated places (don't break the chain):
  - `nuxt.config.ts` reads `shared/louis-env.mjs` at build time for baked-in defaults, and injects a `LOUIS_* → NUXT_*` alias preamble into the built `nitro.mjs` (right before `const _sharedRuntimeConfig`) via a `nitro.hooks.compiled` hook — Nitro deep-freezes shared runtimeConfig, so LOUIS_* must be aliased onto NUXT_* before the freeze.
  - `server/plugins/00-louis-env.ts` applies env at Nitro boot in dev/native.
  - Electron `desktop/main.mjs` reads env to pass to the spawned server.
- Reading config in server code: `useRuntimeConfig(event)` (or without event); never read `process.env` directly for these values in server endpoints — it bypasses the runtimeConfig pipeline.

### Server UI credentials (web/Settings → Advanced)

- The web UI (non-desktop only; Electron uses its own `configStore.mjs`) can set **Yoto/Spotify client IDs + secrets + an optional Spotify redirect URI** in Settings → Advanced → "Server credentials".
- Persisted as plaintext JSON to `<audioWorkDir>/settings.json` (Docker: `/data/audio/settings.json`) via `PUT /api/settings`; state via `GET /api/settings` (`{ saved, effective, restartRequired }`).
- **Applied at the next restart**: non-empty saved fields override `LOUIS_*`/`.env` at boot. Dev: `nuxt.config.ts` top-level `overlayServerSettingsFile()` sets `process.env.LOUIS_*` before defaults are computed. Production: the injected nitro preamble (in `nuxt.config.ts`) re-reads the same file at runtime before runtimeConfig is frozen.
- Shared pure logic: `shared/louis-settings.mjs` (+ `.test.ts`). Nitro helpers: `server/utils/server-settings.ts`. Endpoints: `server/api/settings.get.ts` / `settings.put.ts`. UI: `app/components/layout/ServerCredentialsFields.vue` + `app/composables/useServerSettings.ts`.
- Do not put `settings.json` under `cache/` or `jobs/` — audio-work-dir maintenance sweeps those; it only ever reads/writes the work-dir root.

## OAuth flows

- **Yoto**: public PKCE client (`pkce-challenge`). Bundled public client ID: `PK00MDKCVwWvOG8o3px3qSl57FhfUZxm` (see README table for which redirect origins it matches). Scope set: `offline_access user:content:view user:content:manage user:icons:manage`.
- **Spotify**: OAuth auth-code + PKCE; client ID + secret in env are enough to **paste playlist URLs**; "Connect" (listing playlists) additionally needs a dashboard-registered HTTPS redirect URI (Spotify rejects `localhost`; see `docs/SPOTIFY.md` — mkcert or cloudflared).
- Redirect URIs are endpoint-anchored: `/api/yoto/auth/callback`, `/api/spotify/auth/callback`. Ports: desktop **4010**, dev/Docker **4000**.

## Audio pipeline (server)

- **YouTube**: search/download via bundled **yt-dlp** (also used when `LOUIS_YOUTUBE_API_KEY` provides typed search via YouTube Data API v3 with safeSearch).
- **Spotify**: metadata → **spotDL** (`spotdl save --preload`) → YouTube URLs → downloaded by yt-dlp like any other track. Resolve results cached ~10 min.
- **Transcode**: ffmpeg (`server/utils/ffmpeg-*.ts`): loudnorm normalize, split >55 min sources, intros/outros trim, waveform peaks, MP3/m4a for Yoto.
- Work dir `LOUIS_AUDIO_WORK_DIR` (Docker `/data/audio`); maintenance runs in `server/plugins/audio-work-dir.ts`.
- **Save jobs are in-memory / process-local** → Louis must be run **single-replica**. Do not "fix" this by adding shared state without addressing HA/docker scale-out expectations.
- yt-dlp sometimes needs `--js-runtimes` (YouTube EJS/nsig): default `node`, desktop sets `node:<Electron shim>` via `desktop/js-runtime.mjs` (see `server/utils/ytdlp-js-runtime.ts` + `shared/ytdlp-js-runtime-*.mjs`).
- Optional Netscape cookies.txt for downloads that hit bot checks (`LOUIS_YTDLP_COOKIES_FILE`); anonymous-first, cookies only as escalation.

## Desktop (Electron)

- `desktop/main.mjs` is the app entry; it spawns or builds the Nitro server (bundled app uses the compiled `.output`), hosts OAuth on port 4010, and passes `LOUIS_PUBLIC_DESKTOP=1`.
- Community binaries (yt-dlp, ffmpeg, spotdl, node) are fetched by `desktop/scripts/fetch-binaries.mjs` (see `desktop/resources/bin/`) and embedded by electron-builder.
- `desktop/configStore.mjs` + `configStore.test.mjs`: persisted user config (uses Electron `app.getPath`); also the Settings → Advanced client-ID/redirect handling.

## Release process

See `docs/RELEASE.md` and `.release-it.json`. Version lives in `package.json`; Home Assistant add-on pin is mirrored (`npm run desktop:sync-version` script, `homeassistant/louis/`). CHANGELOG via `@release-it/keep-a-changelog`.

## Gotchas / notes

- Dev URL is **127.0.0.1:4000** (loopback binding is intentional so OAuth redirect URIs match; override with `LOUIS_DEV_HOST`/`LOUIS_DEV_PORT`).
- `.env` is gitignored (only `.env.example` is committed). Never commit real `LOUIS_*` secrets or cookies files.
- `.nuxt/`, `.output/`, `desktop/out/`, `desktop/dist/`, `desktop/resources/bin/` are gitignored build artifacts.
- The app is mobile + desktop responsive; there are dedicated phone flows (Add to playlist drawer, Menu → Update all) and a desktop drag-and-drop editor.
- When changing client behavior of the search/import flows, look in `app/components/youtube-picker/` and `app/components/myo-editor/`; the Spotify bar lives at `app/components/youtube-picker/SpotifyPlaylistsBar.vue` with `app/composables/useSpotify.ts`.