import { writeServerSettingsState } from '../utils/server-settings'

const SETTINGS_KEYS = [
  'yotoClientId',
  'yotoClientSecret',
  'spotifyClientId',
  'spotifyClientSecret',
  'spotifyRedirectUri',
] as const

export default defineEventHandler(async (event) => {
  const body = await readBody<Record<string, unknown>>(event).catch(() => ({}))
  const patch: Record<string, string> = {}
  for (const key of SETTINGS_KEYS) {
    const raw = body?.[key]
    patch[key] = typeof raw === 'string' ? raw.trim() : ''
  }
  return await writeServerSettingsState(event, patch)
})