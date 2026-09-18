import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import type { H3Event } from 'h3'
import type { SpotifyResolveResponse } from '../../shared/spotifyTypes.ts'
import {
  parseSpotifyResource,
  type SpotifyResourceRef,
} from '../../shared/spotifyUrl.ts'
import {
  mapSpotdlSongsToImportItems,
  parseSpotdlSaveJson,
  spotdlArtistLabel,
  spotdlSongTitle,
} from '../../shared/spotdlMap.ts'
import { getSpotifyConfig, fetchSpotifyPlaylistSummary } from './spotify'
import { withRequestCtx } from './request-context'

const execFileAsync = promisify(execFile)

/** In-memory resolve cache — avoids re-running spotDL for the same playlist in one session. */
const resolveCache = new Map<string, { until: number, value: SpotifyResolveResponse }>()
const RESOLVE_CACHE_MS = 10 * 60_000

export interface SpotdlStatus {
  available: boolean
  path?: string
  version?: string
  error?: string
}

function expandSpotdlCandidates(candidate: string): string[] {
  if (candidate.includes('/') || candidate.includes('\\')) return [candidate]
  const dirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean)
  const names = process.platform === 'win32' && !candidate.endsWith('.exe')
    ? [`${candidate}.exe`, candidate]
    : [candidate]
  const out: string[] = []
  for (const dir of dirs) {
    for (const name of names) out.push(path.join(dir, name))
  }
  out.push(candidate)
  return out
}

function getSpotdlConfiguredPath(event: H3Event): string {
  const config = useRuntimeConfig(event)
  return String(config.spotdlPath ?? '').trim() || 'spotdl'
}

async function resolveSpotdlBinary(configured: string): Promise<string | null> {
  const candidates = expandSpotdlCandidates(configured)
  for (const candidate of candidates) {
    try {
      const { stdout } = await execFileAsync(candidate, ['--version'], {
        timeout: 20_000,
        env: process.env,
      })
      const version = stdout.trim().split('\n')[0] || 'unknown'
      if (version) return candidate
    }
    catch {
      // try next
    }
  }
  return null
}

/** Sync load + build the shim (small file; fine to be sync off the hot path). */
function buildSpotdlShim(binary: string, searchAttempts: number, workDir: string): string | null {
  const attempts = Math.max(1, Math.min(3, Math.round(searchAttempts) || 1))
  if (attempts >= 3) return null
  let script = ''
  try {
    script = readFileSync(binary, 'utf8')
  }
  catch {
    return null
  }
  const shebang = /^#!\s*([^\r\n]+)/m.exec(script)?.[1]?.trim() || ''
  if (!shebang) return null
  const interpreter = shebang.startsWith('/usr/bin/env ')
    ? shebang.slice('/usr/bin/env '.length).trim()
    : shebang
  if (!interpreter) return null

  const shimPath = path.join(workDir, 'spotdl-search-attempts.py')
  const shim = [
    'import runpy, sys',
    'try:',
    '    import spotdl.providers.audio.ytmusic as _ytm',
    `    _ytm.YouTubeMusic.SEARCH_ATTEMPTS = ${attempts}`,
    'except Exception:',
    '    pass',
    `runpy.run_path(${JSON.stringify(binary)}, run_name="__main__")`,
    '',
  ].join('\n')
  writeFileSync(shimPath, shim, 'utf8')
  return interpreter
}

async function execSpotdl(
  binary: string,
  args: string[],
  options: {
    env: NodeJS.ProcessEnv
    workDir: string
    searchAttempts: number
    timeout: number
    maxBuffer: number
  },
): Promise<{ stdout: string, stderr: string }> {
  const interpreter = buildSpotdlShim(binary, options.searchAttempts, options.workDir)
  if (interpreter) {
    const shimPath = path.join(options.workDir, 'spotdl-search-attempts.py')
    try {
      return await execFileAsync(interpreter, [shimPath, ...args], {
        timeout: options.timeout,
        maxBuffer: options.maxBuffer,
        env: options.env,
      })
    }
    catch (err) {
      // Fall back to the real binary: patching broken, but search still works.
      console.warn(
        `[spotdl] attempts shim failed (${err instanceof Error ? err.message : err}); falling back to direct binary`,
      )
    }
  }
  return execFileAsync(binary, args, {
    timeout: options.timeout,
    maxBuffer: options.maxBuffer,
    env: options.env,
  })
}

export async function getSpotdlStatus(event: H3Event): Promise<SpotdlStatus> {
  const configured = getSpotdlConfiguredPath(event)
  const binary = await resolveSpotdlBinary(configured)
  if (!binary) {
    return {
      available: false,
      error: `spotDL not found (${configured}). Install: pip install spotdl`,
    }
  }
  try {
    const { stdout } = await execFileAsync(binary, ['--version'], {
      timeout: 20_000,
      env: process.env,
    })
    return {
      available: true,
      path: binary,
      version: stdout.trim().split('\n')[0] || 'unknown',
    }
  }
  catch (err: unknown) {
    return {
      available: false,
      path: binary,
      error: err instanceof Error ? err.message : 'spotDL --version failed',
    }
  }
}

async function runSpotdlSavePreload(
  event: H3Event,
  resource: SpotifyResourceRef,
): Promise<ReturnType<typeof parseSpotdlSaveJson>> {
  const status = await getSpotdlStatus(event)
  if (!status.available || !status.path) {
    throw createError({
      statusCode: 503,
      statusMessage: status.error || 'spotDL is not installed',
    })
  }

  const { clientId, clientSecret } = getSpotifyConfig(event)
  const workDir = await mkdtemp(path.join(tmpdir(), 'louis-spotdl-'))
  const saveFile = path.join(workDir, 'playlist.spotdl')

  try {
    await writeFile(saveFile, '[]', 'utf8')

    const args = [
      'save',
      resource.url,
      '--save-file',
      saveFile,
      '--preload',
      '--client-id',
      clientId,
      '--client-secret',
      clientSecret,
      '--log-level',
      'WARNING',
      '--simple-tui',
      // We only need the YouTube URL mapping — skip per-song lyrics lookups
      // (genius/musixmatch/azlyrics) which otherwise hit 3 extra providers per track.
      '--lyrics',
    ]

    const config = useRuntimeConfig(event)
    const searchAttempts = Number(config.spotdlSearchAttempts ?? 1) || 1
    const startedAt = Date.now()
    await execSpotdl(status.path, args, {
      timeout: 15 * 60_000,
      maxBuffer: 16 * 1024 * 1024,
      workDir,
      searchAttempts,
      env: {
        ...process.env,
        SPOTIPY_CLIENT_ID: clientId,
        SPOTIPY_CLIENT_SECRET: clientSecret,
      },
    })
    console.info(`${withRequestCtx(event, '[spotdl]')} spotdl save took ${Date.now() - startedAt}ms (searchAttempts=${searchAttempts})`)

    const raw = await readFile(saveFile, 'utf8')
    return parseSpotdlSaveJson(raw)
  }
  catch (err: unknown) {
    const e = err as { stderr?: string, message?: string, statusCode?: number }
    if (e.statusCode) throw err
    const detail = (e.stderr || e.message || 'spotDL save failed').toString().trim()
    const short = detail.split('\n').filter(Boolean).slice(-4).join(' ')
    console.error(`${withRequestCtx(event, '[spotdl]')} save failed: ${short.slice(0, 400)}`)
    throw createError({
      statusCode: 502,
      statusMessage: `spotDL failed: ${short.slice(0, 400)}`,
    })
  }
  finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {})
  }
}

export async function resolveSpotifyResourceToYoutube(
  event: H3Event,
  rawUrl: string,
  options?: { bypassCache?: boolean },
): Promise<SpotifyResolveResponse> {
  const resource = parseSpotifyResource(rawUrl)
  if (!resource) {
    throw createError({
      statusCode: 400,
      statusMessage: 'A valid Spotify playlist, album, or track URL is required',
    })
  }

  const cacheKey = `${resource.kind}:${resource.id}`
  if (!options?.bypassCache) {
    const cached = resolveCache.get(cacheKey)
    if (cached && cached.until > Date.now()) {
      console.info(
        `${withRequestCtx(event, '[spotdl]')} cache hit ${resource.kind}=${resource.id} (${cached.value.items.length} items, ${cached.value.unmatched} unmatched)`,
      )
      return cached.value
    }
  }

  console.info(
    `${withRequestCtx(event, '[spotdl]')} resolve start ${resource.kind}=${resource.id} ${resource.url}${options?.bypassCache ? ' (bypassCache)' : ''}`,
  )
  const startedAt = Date.now()
  const songs = await runSpotdlSavePreload(event, resource)
  const { items, unmatched } = mapSpotdlSongsToImportItems(songs)
  console.info(
    `${withRequestCtx(event, '[spotdl]')} resolve done ${resource.kind}=${resource.id} in ${Date.now() - startedAt}ms -> ${items.length} items, ${unmatched} unmatched`,
  )

  let playlist: SpotifyResolveResponse['playlist']
  if (resource.kind === 'playlist') {
    const summary = await fetchSpotifyPlaylistSummary(event, resource.id)
    playlist = {
      id: resource.id,
      title: summary?.name || 'Spotify playlist',
      channelTitle: summary?.ownerName || 'Spotify',
      itemCount: summary?.trackCount ?? items.length + unmatched,
      spotifyId: resource.id,
      spotifyUrl: resource.url,
    }
  }
  else if (resource.kind === 'album') {
    const albumName = songs[0]?.album_name?.trim()
    playlist = {
      id: resource.id,
      title: albumName || spotdlSongTitle(songs[0] || {}) || 'Spotify album',
      channelTitle: spotdlArtistLabel(songs[0] || {}),
      itemCount: items.length + unmatched,
      spotifyId: resource.id,
      spotifyUrl: resource.url,
    }
  }
  else {
    playlist = {
      id: resource.id,
      title: spotdlSongTitle(songs[0] || {}) || 'Spotify track',
      channelTitle: spotdlArtistLabel(songs[0] || {}),
      itemCount: items.length + unmatched,
      spotifyId: resource.id,
      spotifyUrl: resource.url,
    }
  }

  const value: SpotifyResolveResponse = {
    playlist,
    items,
    unmatched,
    resolver: 'spotdl',
  }
  resolveCache.set(cacheKey, { until: Date.now() + RESOLVE_CACHE_MS, value })
  return value
}
