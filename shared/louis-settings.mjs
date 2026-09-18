/**
 * Server-side credential settings persisted to `<audioWorkDir>/settings.json`.
 * Kept out of server/ so pure-Node unit tests never import Nitro.
 * The settings file is read at server boot (overlaid onto the env) so values
 * apply after a restart. Desktop (Electron) uses its own configStore instead.
 */
import { join } from 'node:path'

export const SERVER_SETTINGS_FILE_NAME = 'settings.json'

/**
 * Each settings field maps to a `LOUIS_*` env var (legacy `NUXT_*` dual-written,
 * matching the desktop configStore pattern).
 * @type {{ name: string, louis: string, nuxt: string }[]}
 */
export const SERVER_SETTINGS_ENV_FIELDS = [
  { name: 'yotoClientId', louis: 'LOUIS_YOTO_CLIENT_ID', nuxt: 'NUXT_YOTO_CLIENT_ID' },
  { name: 'yotoClientSecret', louis: 'LOUIS_YOTO_CLIENT_SECRET', nuxt: 'NUXT_YOTO_CLIENT_SECRET' },
  { name: 'spotifyClientId', louis: 'LOUIS_SPOTIFY_CLIENT_ID', nuxt: 'NUXT_SPOTIFY_CLIENT_ID' },
  { name: 'spotifyClientSecret', louis: 'LOUIS_SPOTIFY_CLIENT_SECRET', nuxt: 'NUXT_SPOTIFY_CLIENT_SECRET' },
  { name: 'spotifyRedirectUri', louis: 'LOUIS_SPOTIFY_REDIRECT_URI', nuxt: 'NUXT_SPOTIFY_REDIRECT_URI' },
]

/**
 * @typedef {{
 *   yotoClientId: string,
 *   yotoClientSecret: string,
 *   spotifyClientId: string,
 *   spotifyClientSecret: string,
 *   spotifyRedirectUri: string,
 * }} ServerSettings
 */

/**
 * @param {string} audioWorkDir - `LOUIS_AUDIO_WORK_DIR`, or '' to use the default
 * @param {string} tmpdir - `os.tmpdir()` for the default location
 * @returns {string}
 */
export function serverSettingsFilePath(audioWorkDir, tmpdir) {
  if (audioWorkDir) return join(audioWorkDir, SERVER_SETTINGS_FILE_NAME)
  return join(tmpdir, 'yoto-cards-audio', SERVER_SETTINGS_FILE_NAME)
}

/**
 * @param {unknown} raw
 * @returns {ServerSettings}
 */
export function normalizeServerSettings(raw) {
  const src = raw && typeof raw === 'object' ? /** @type {Record<string, unknown>} */ (raw) : {}
  return {
    yotoClientId: typeof src.yotoClientId === 'string' ? src.yotoClientId.trim() : '',
    yotoClientSecret: typeof src.yotoClientSecret === 'string' ? src.yotoClientSecret.trim() : '',
    spotifyClientId: typeof src.spotifyClientId === 'string' ? src.spotifyClientId.trim() : '',
    spotifyClientSecret: typeof src.spotifyClientSecret === 'string' ? src.spotifyClientSecret.trim() : '',
    spotifyRedirectUri: typeof src.spotifyRedirectUri === 'string' ? src.spotifyRedirectUri.trim() : '',
  }
}

/**
 * @param {ServerSettings} settings
 */
export function serverSettingsNeedsSetup(settings) {
  return Boolean(!normalizeServerSettings(settings).yotoClientId)
}

/**
 * Merge a partial patch onto current settings without dropping omitted keys.
 * @param {ServerSettings} current
 * @param {Partial<ServerSettings> | null | undefined} patch
 * @returns {ServerSettings}
 */
export function mergeServerSettings(current, patch) {
  return normalizeServerSettings({ ...current, ...(patch || {}) })
}

/**
 * Write non-empty settings fields onto an env object (LOUIS_* + legacy NUXT_*).
 * Empty/cleared fields are left alone so they fall back to process env.
 * @param {Record<string, string | undefined>} env
 * @param {ServerSettings} settings
 */
export function applyServerSettingsToEnv(env, settings) {
  const normalized = normalizeServerSettings(settings)
  for (const field of SERVER_SETTINGS_ENV_FIELDS) {
    const value = String(normalized[field.name] || '').trim()
    if (!value) continue
    env[field.louis] = value
    env[field.nuxt] = value
  }
}