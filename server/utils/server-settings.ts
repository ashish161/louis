import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname } from 'node:path'
import type { H3Event } from 'h3'
import {
  mergeServerSettings,
  normalizeServerSettings,
  serverSettingsFilePath,
} from '#shared/louis-settings.mjs'
import { resolveAudioWorkDirConfig } from './audio-work-dir'

export interface ServerSettings {
  yotoClientId: string
  yotoClientSecret: string
  spotifyClientId: string
  spotifyClientSecret: string
  spotifyRedirectUri: string
}

export interface EffectiveServerSettings {
  yotoClientId: string
  yotoClientSecret: string
  spotifyClientId: string
  spotifyClientSecret: string
  spotifyRedirectUri: string
}

/** Values currently in use by this boot (from runtime config, not the saved file). */
export function getEffectiveServerSettings(event?: H3Event): EffectiveServerSettings {
  const config = event ? useRuntimeConfig(event) : useRuntimeConfig()
  return {
    yotoClientId: String(config.yotoClientId ?? '').trim(),
    yotoClientSecret: String(config.yotoClientSecret ?? '').trim(),
    spotifyClientId: String(config.spotifyClientId ?? '').trim(),
    spotifyClientSecret: String(config.spotifyClientSecret ?? '').trim(),
    spotifyRedirectUri: String(config.spotifyRedirectUri ?? '').trim(),
  }
}

export function getServerSettingsFilePath(event?: H3Event): string {
  const workDir = resolveAudioWorkDirConfig(event).audioWorkDir
  return serverSettingsFilePath(workDir, tmpdir())
}

/**
 * Settings file location lives relative to the audio work dir, so it must not
 * be swept by cache maintenance (which only touches cache/ and jobs/).
 */
export function getServerSettingsConfigDir(event?: H3Event): string {
  return dirname(getServerSettingsFilePath(event))
}

export async function readServerSettings(event?: H3Event): Promise<ServerSettings> {
  try {
    const file = getServerSettingsFilePath(event)
    if (!existsSync(file)) return normalizeServerSettings({})
    const raw = JSON.parse(await readFile(file, 'utf8')) as unknown
    return normalizeServerSettings(raw)
  }
  catch {
    return normalizeServerSettings({})
  }
}

export async function writeServerSettings(
  event: H3Event,
  patch: Partial<ServerSettings>,
): Promise<ServerSettings> {
  const current = await readServerSettings(event)
  const next = mergeServerSettings(current, patch)
  const file = getServerSettingsFilePath(event)
  await mkdir(getServerSettingsConfigDir(event), { recursive: true })
  await writeFile(file, `${JSON.stringify(normalizeServerSettings(next), null, 2)}\n`, 'utf8')
  return normalizeServerSettings(next)
}

/** Persist a patch and report the resulting state with restart status. */
export async function writeServerSettingsState(
  event: H3Event,
  patch: Partial<ServerSettings>,
) {
  const saved = await writeServerSettings(event, patch)
  const effective = getEffectiveServerSettings(event)
  const restartRequired = serverSettingsRestartRequired(saved, effective)
  return { saved, effective, restartRequired }
}

export function serverSettingsRestartRequired(
  saved: ServerSettings,
  effective: EffectiveServerSettings,
): boolean {
  // Settings only override env when non-empty, so only non-empty saved fields
  // can represent a pending change after the next restart.
  return Boolean(
    (saved.yotoClientId && saved.yotoClientId !== effective.yotoClientId)
    || (saved.yotoClientSecret && saved.yotoClientSecret !== effective.yotoClientSecret)
    || (saved.spotifyClientId && saved.spotifyClientId !== effective.spotifyClientId)
    || (saved.spotifyClientSecret && saved.spotifyClientSecret !== effective.spotifyClientSecret)
    || (saved.spotifyRedirectUri && saved.spotifyRedirectUri !== effective.spotifyRedirectUri),
  )
}

/** Persisted file state + what is active now, so the UI can flag a pending restart. */
export async function readServerSettingsState(event: H3Event) {
  const saved = await readServerSettings(event)
  const effective = getEffectiveServerSettings(event)
  const restartRequired = serverSettingsRestartRequired(saved, effective)
  return { saved, effective, restartRequired }
}