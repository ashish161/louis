import tailwindcss from '@tailwindcss/vite'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { LOUIS_ENV_BINDINGS, louisRuntimeConfigDefaults, pickLouisEnv } from './shared/louis-env.mjs'
import {
  applyServerSettingsToEnv,
  normalizeServerSettings,
  serverSettingsFilePath,
} from './shared/louis-settings.mjs'

const packageJson = JSON.parse(
  readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf8'),
) as { version?: string }

/**
 * Server-settings file values win over .env so UI-saved credentials apply.
 * Dev/native evaluate this config before Nitro boots; production re-reads the
 * same file at runtime via the injected nitro preamble below.
 */
function overlayServerSettingsFile() {
  try {
    const file = serverSettingsFilePath(
      pickLouisEnv('LOUIS_AUDIO_WORK_DIR', 'NUXT_AUDIO_WORK_DIR'),
      tmpdir(),
    )
    if (!existsSync(file)) return
    const raw = JSON.parse(readFileSync(file, 'utf8')) as unknown
    applyServerSettingsToEnv(process.env, normalizeServerSettings(raw))
  }
  catch {
    // Best-effort: unreadable settings file must not block startup.
  }
}
overlayServerSettingsFile()

const louisEnv = louisRuntimeConfigDefaults()

/** Injected into nitro.mjs immediately before _sharedRuntimeConfig is frozen. */
const louisEnvAliasPreamble = `(()=>{try{
const settingsFields=${JSON.stringify([
  ['yotoClientId', 'LOUIS_YOTO_CLIENT_ID', 'NUXT_YOTO_CLIENT_ID'],
  ['yotoClientSecret', 'LOUIS_YOTO_CLIENT_SECRET', 'NUXT_YOTO_CLIENT_SECRET'],
  ['spotifyClientId', 'LOUIS_SPOTIFY_CLIENT_ID', 'NUXT_SPOTIFY_CLIENT_ID'],
  ['spotifyClientSecret', 'LOUIS_SPOTIFY_CLIENT_SECRET', 'NUXT_SPOTIFY_CLIENT_SECRET'],
  ['spotifyRedirectUri', 'LOUIS_SPOTIFY_REDIRECT_URI', 'NUXT_SPOTIFY_REDIRECT_URI'],
])};
const g=(n)=>typeof process.getBuiltinModule==="function"?process.getBuiltinModule(n):null;
const fsN=g("node:fs"),osN=g("node:os"),pN=g("node:path");
if(fsN&&osN&&pN){
  const work=(process.env.LOUIS_AUDIO_WORK_DIR||process.env.NUXT_AUDIO_WORK_DIR||"").trim();
  const tmp=osN.tmpdir?osN.tmpdir():process.env.TMPDIR||(process.platform==="win32"?"C:\\\\WINDOWS\\\\Temp":"/tmp");
  const base=work||(tmp?pN.join(tmp,"yoto-cards-audio"):null);
  if(base){
    const file=pN.join(base,"settings.json");
    if(fsN.existsSync(file)){
      try{
        const s=JSON.parse(fsN.readFileSync(file,"utf8"));
        for(const[k,l,n]of settingsFields){const v=String(s[k]||"").trim();if(v){process.env[l]=v;process.env[n]=v;}}
      }catch(eSettings){}
    }
  }
}
const b=${JSON.stringify(
  LOUIS_ENV_BINDINGS.map(({ louis, nuxt }) => [louis, nuxt]),
)};
for(const[l,n]of b){const v=process.env[l];if(v!=null&&String(v).trim()!=="")process.env[n]=String(v).trim()}
}catch(ePreamble){}})();\n`

/**
 * Nitro emits the server bundle under chunks/nitro/ on macOS/Linux, but often
 * chunks/_/ on Windows (Rollup getChunkName path-separator mismatch).
 */
function resolveNitroBundlePath(outputDir: string): string | null {
  const chunksDir = join(outputDir, 'server/chunks')
  const preferred = [
    join(chunksDir, 'nitro/nitro.mjs'),
    join(chunksDir, '_/nitro.mjs'),
  ]
  for (const candidate of preferred) {
    if (existsSync(candidate)) return candidate
  }
  if (!existsSync(chunksDir)) return null
  for (const entry of readdirSync(chunksDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const candidate = join(chunksDir, entry.name, 'nitro.mjs')
    if (existsSync(candidate)) return candidate
  }
  return null
}

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: false },
  nitro: {
    hooks: {
      compiled(nitro) {
        // Must patch the nitro chunk: index.mjs import hoisting would run freeze before a preamble.
        const nitroPath = resolveNitroBundlePath(nitro.options.output.dir)
        if (!nitroPath) {
          nitro.logger.warn('[louis-env] could not find nitro.mjs to inject LOUIS_* alias')
          return
        }
        const source = readFileSync(nitroPath, 'utf8')
        const marker = 'const _sharedRuntimeConfig'
        if (source.includes('/*louis-env-alias*/')) return
        const idx = source.indexOf(marker)
        if (idx === -1) {
          nitro.logger.warn('[louis-env] could not find _sharedRuntimeConfig to inject LOUIS_* alias')
          return
        }
        writeFileSync(
          nitroPath,
          `${source.slice(0, idx)}/*louis-env-alias*/${louisEnvAliasPreamble}${source.slice(idx)}`,
        )
      },
    },
  },
  // Production builds don't need client sourcemaps; disabling avoids noisy
  // SOURCEMAP_BROKEN warnings from @tailwindcss/vite and nuxt internals.
  sourcemap: false,
  css: ['./app/assets/css/main.css'],
  app: {
    head: {
      title: 'Louis',
      link: [
        { rel: 'icon', href: '/favicons/favicon.ico', sizes: 'any' },
        { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicons/favicon-32x32.png' },
        { rel: 'icon', type: 'image/png', sizes: '16x16', href: '/favicons/favicon-16x16.png' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/favicons/apple-touch-icon.png' },
        { rel: 'manifest', href: '/favicons/manifest.json' },
      ],
      meta: [
        {
          name: 'viewport',
          content: 'width=device-width, initial-scale=1, viewport-fit=cover',
        },
        { name: 'theme-color', content: '#fff5f0' },
        { name: 'mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-title', content: 'Louis' },
        {
          name: 'apple-mobile-web-app-status-bar-style',
          content: 'default',
        },
        { name: 'application-name', content: 'Louis' },
      ],
      // Paint splash ground before Vue boots so the app never flashes underneath.
      style: [
        {
          key: 'app-splash-pending',
          textContent:
            'html.app-splash-pending{background:#fff5f0}'
            + 'html.app-splash-pending body{background:#fff5f0}'
            + 'html.app-splash-pending::before{content:"";position:fixed;inset:0;z-index:114;background:#fff5f0;pointer-events:none}',
        },
      ],
      script: [
        {
          key: 'app-vvh',
          textContent:
            '(function(){try{var h=(window.visualViewport&&window.visualViewport.height)||window.innerHeight;'
            + 'if(h>0)document.documentElement.style.setProperty("--app-vvh",Math.round(h)+"px");'
            + '}catch(e){}})();',
        },
        {
          key: 'app-splash-pending',
          // Runs before body parse; mirrors useAppSplash session/debug rules.
          // TEMP: `force=true` matches FORCE_SPLASH_EVERY_REFRESH in useAppSplash.
          textContent:
            '(function(){try{var d=document.documentElement;'
            + 'var force=true;'
            + 'var debug=new URLSearchParams(location.search).get("splash")==="debug";'
            + 'var seen=sessionStorage.getItem("louis.splash.seen")==="1";'
            + 'var reduced=window.matchMedia("(prefers-reduced-motion: reduce)").matches;'
            + 'if(force||debug||(!seen&&!reduced))d.classList.add("app-splash-pending");'
            + '}catch(e){document.documentElement.classList.add("app-splash-pending")}})();',
        },
      ],
    },
  },
  components: [
    {
      path: '~/components/ui',
      pathPrefix: false,
    },
    {
      path: '~/components',
      ignore: ['ui'],
    },
  ],
  devServer: {
    // Bind loopback so Spotify OAuth matches 127.0.0.1 redirect URIs (not localhost).
    host: process.env.LOUIS_DEV_HOST || '127.0.0.1',
    port: Number(process.env.LOUIS_DEV_PORT || 4000),
    https: (() => {
      const keyPath = process.env.LOUIS_DEV_TLS_KEY?.trim()
      const certPath = process.env.LOUIS_DEV_TLS_CERT?.trim()
      if (!keyPath || !certPath) return false
      if (!existsSync(keyPath) || !existsSync(certPath)) {
        console.warn('[louis-dev] LOUIS_DEV_TLS_* set but cert files missing — dev server stays HTTP')
        return false
      }
      return {
        key: readFileSync(keyPath),
        cert: readFileSync(certPath),
      }
    })(),
  },
  // Prefer LOUIS_* at runtime (see .env.example); legacy NUXT_* still works.
  // Production: nitro compiled hook aliases LOUIS_* → NUXT_* in nitro.mjs before freeze.
  runtimeConfig: {
    youtubeApiKey: louisEnv.youtubeApiKey,
    youtubeSafeSearch: louisEnv.youtubeSafeSearch || 'moderate',
    yotoClientId: louisEnv.yotoClientId,
    yotoClientSecret: louisEnv.yotoClientSecret,
    yotoRedirectUri: louisEnv.yotoRedirectUri,
    spotifyClientId: louisEnv.spotifyClientId,
    spotifyClientSecret: louisEnv.spotifyClientSecret,
    spotifyRedirectUri: louisEnv.spotifyRedirectUri,
    spotdlPath: louisEnv.spotdlPath,
    spotdlSearchAttempts: louisEnv.spotdlSearchAttempts,
    ytdlpPath: louisEnv.ytdlpPath,
    // Optional Netscape cookies.txt for yt-dlp (LOUIS_YTDLP_COOKIES_FILE). Anon-first; used on escalate.
    ytdlpCookiesFile: louisEnv.ytdlpCookiesFile,
    /** yt-dlp `--js-runtimes` value (`node` or `node:/abs/shim` on desktop). */
    ytdlpJsRuntime: louisEnv.ytdlpJsRuntime,
    audioWorkDir: louisEnv.audioWorkDir,
    audioJobMaxAgeMs: louisEnv.audioJobMaxAgeMs,
    audioCacheMaxAgeMs: louisEnv.audioCacheMaxAgeMs,
    audioCacheMaxBytes: louisEnv.audioCacheMaxBytes,
    enableDebugRoutes: louisEnv.enableDebugRoutes,
    public: {
      appVersion: packageJson.version || '0.0.0',
      /** Set LOUIS_PUBLIC_DESKTOP=1 by the Electron host when spawning Nitro. */
      desktop: louisEnv.publicDesktop,
    },
  },
  vite: {
    plugins: [
      tailwindcss(),
      {
        name: 'suppress-sourcemap-broken-warnings',
        apply: 'build',
        configResolved(config) {
          const previous = config.build.rollupOptions.onwarn
          config.build.rollupOptions.onwarn = (warning, warn) => {
            if (warning.code === 'SOURCEMAP_BROKEN') return
            if (previous) previous(warning, warn)
            else warn(warning)
          }
        },
      },
    ],
    build: {
      sourcemap: false,
    },
  },
})
