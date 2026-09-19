import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import type { H3Event } from 'h3'
import type { SpotifyResolveResponse } from '../../shared/spotifyTypes.ts'
import type { YoutubePlaylistImportItem } from '../../shared/myo-editor/youtubePlaylistImport.ts'
import {
  parseSpotifyResource,
  type SpotifyResourceRef,
} from '../../shared/spotifyUrl.ts'
import {
  parseSpotdlSaveJson,
  spotdlArtistLabel,
  spotdlSongToImportItem,
  spotdlSongTitle,
  type SpotdlSong,
} from '../../shared/spotdlMap.ts'
import {
  SPOTIFY_RESOLVE_CACHE_VERSION,
  cacheKeysForSongs,
  importItemFromCached,
  materializeCachedItems,
  songResolveKey,
  splitReusableKeys,
  type CachedSpotResolveItem,
} from '../../shared/spotifyResolveCache.ts'
import { getSpotifyConfig, fetchSpotifyPlaylistSummary } from './spotify'
import { loadSpotifyResolveCache, writeSpotifyResolveCache } from './spotify-resolve-cache'
import { withRequestCtx } from './request-context'
import { searchYoutubeViaYtdlp } from './youtube-ytdlp-discovery'
import { scoreYoutubeFallbackMatch, formatSeconds } from '#shared/youtubeFallbackMatch'

const execFileAsync = promisify(execFile)

/** In-memory resolve cache — avoids re-running spotDL for the same playlist in one session. */
const resolveCache = new Map<string, { until: number, value: SpotifyResolveResponse }>()
const RESOLVE_CACHE_MS = 10 * 60_000

/** Hard cap on per-resolve YouTube-search fallbacks (yt-dlp discovery is 2-at-a-time). */
const YOUTUBE_FALLBACK_MAX_SEARCHES = 60

/** Ignore fallback matches this weak (kills incidental title-token hits). */
const YOUTUBE_FALLBACK_MIN_SCORE = 20

/**
 * When a cached resolve is missing only a few tracks, preload those individually
 * instead of re-running the whole playlist through spotDL.
 */
const SPOTIFY_RESOLVE_INCREMENTAL_MAX_PRELOAD = 6

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

/**
 * For songs spotDL failed to match on YouTube Music, search plain YouTube via
 * Louis's yt-dlp discovery (robust against unavailable/geo-blocked results).
 *
 * spotDL's preload save stores unresolvable songs as null entries, so the
 * names of those songs are recovered from a fast metadata-only spotdl dump
 * (no `--preload`) keyed by playlist position — supplied by the caller.
 * `alreadyMatched` is the set of resolve keys (song ids / `pos:N`) that were
 * handled by spotDL or the cache; only other positions are searched. Tries
 * `artist - title`, then bare `title` (nursery recordings are usually indexed
 * under their title, not a Spotify artist). Capped per resolve to bound
 * wall-clock time.
 */
async function youtubeFallbackForUnmatchedSongs(
  event: H3Event,
  metadataSongs: SpotdlSong[],
  alreadyMatched: Set<string>,
): Promise<{ items: YoutubePlaylistImportItem[], found: number, skipped: boolean }> {
  if (metadataSongs.length === 0) {
    console.warn(
      `${withRequestCtx(event, '[spotdl]')} spotdl metadata dump empty; skipping yt fallback (not caching)`,
    )
    return { items: [], found: 0, skipped: true }
  }

  const unmatchedPositions = metadataSongs
    .map((song, index) => ({ song, index }))
    .filter(({ song, index }) => !alreadyMatched.has(songResolveKey(song, index)))
    .slice(0, YOUTUBE_FALLBACK_MAX_SEARCHES)
    .map(({ index }) => index)

  if (unmatchedPositions.length === 0) return { items: [], found: 0, skipped: false }

  const items: YoutubePlaylistImportItem[] = []
  let found = 0
  for (const index of unmatchedPositions) {
    const meta = metadataSongs[index]
    if (!meta) continue
    const track = {
      title: spotdlSongTitle(meta),
      artist: spotdlArtistLabel(meta),
      durationSec: meta.duration !== undefined && meta.duration !== null
        ? Number(meta.duration)
        : undefined,
    }
    if (track.title === 'Unknown track' || !track.title.trim()) continue

    const queries = [
      track.artist && track.artist !== 'Spotify'
        ? `${track.artist} - ${track.title}`
        : track.title,
      track.title,
    ]

    let match: Awaited<ReturnType<typeof searchYoutubeViaYtdlp>>['items'][number] | null = null
    let usedQuery = ''
    let bestScore = 0
    for (const query of queries) {
      try {
        const page = await searchYoutubeViaYtdlp(event, { q: query, maxResults: 6 })
        usedQuery = query
        for (const result of page.items) {
          const score = scoreYoutubeFallbackMatch(track, result)
          if (score >= YOUTUBE_FALLBACK_MIN_SCORE && score > bestScore) {
            bestScore = score
            match = result
            usedQuery = query
          }
        }
      }
      catch (err) {
        console.warn(
          `${withRequestCtx(event, '[spotdl]')} youtube fallback search failed for "${query}": ${err instanceof Error ? err.message : String(err)}`,
        )
      }
    }
    if (!match) continue

    const finalDurationSeconds = typeof match.durationSeconds === 'number'
      ? match.durationSeconds
      : track.durationSec
    const songId = typeof meta.song_id === 'string' ? meta.song_id.trim() : ''
    const spotifyUrl = typeof meta.url === 'string' ? meta.url.trim() : ''
    const position = typeof meta.list_position === 'number'
      ? meta.list_position
      : index + 1
    const playlistItemId = songId || (spotifyUrl ? `spotify:${spotifyUrl}` : `ytfb:${match.id}:${index}`)

    items.push({
      playlistItemId,
      videoId: match.id,
      position,
      title: track.title,
      channelTitle: track.artist || match.channelTitle,
      thumbnailUrl: (meta.cover_url || meta.coverUrl || '').trim() || match.thumbnailUrl || '',
      duration: finalDurationSeconds !== undefined ? formatSeconds(finalDurationSeconds) : undefined,
      durationSeconds: finalDurationSeconds,
      available: true,
    })
    found += 1
    console.info(
      `${withRequestCtx(event, '[spotdl]')} yt fallback matched "${track.title}" via "${usedQuery}" -> ${match.id} (${match.title.slice(0, 60)})`,
    )
  }
  return { items, found, skipped: false }
}

async function runSpotdlSave(
  event: H3Event,
  resource: SpotifyResourceRef,
  options: { preload: boolean },
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

    // Without --preload this is a fast metadata-only dump (no YTM search);
    // used by the plain-YouTube fallback to learn the names of unmatched songs.
    const args = [
      'save',
      resource.url,
      '--save-file',
      saveFile,
      ...(options.preload ? ['--preload'] : []),
      '--client-id',
      clientId,
      '--client-secret',
      clientSecret,
      '--log-level',
      'WARNING',
      '--simple-tui',
      // We only need the metadata/YouTube URL mapping — skip per-song lyrics
      // lookups (genius/musixmatch/azlyrics) which otherwise hit 3 extra
      // providers per track.
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
    console.info(`${withRequestCtx(event, '[spotdl]')} spotdl save took ${Date.now() - startedAt}ms (${options.preload ? 'preload' : 'metadata'}${options.preload ? ` searchAttempts=${searchAttempts}` : ''})`)

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

  // Snapshot id doubles as the exact content fingerprint for playlists —
  // when it matches the cached entry, the whole resolve is already known.
  let summary: Awaited<ReturnType<typeof fetchSpotifyPlaylistSummary>>
  let snapshotId: string | undefined
  if (resource.kind === 'playlist') {
    summary = await fetchSpotifyPlaylistSummary(event, resource.id)
    snapshotId = summary?.snapshotId
  }

  let disk = await loadSpotifyResolveCache(event, resource.kind, resource.id)

  // Hard hit: playlists only. Identical snapshot + full cached mapping = done,
  // no spotDL run at all.
  if (
    !options?.bypassCache
    && resource.kind === 'playlist'
    && snapshotId
    && disk
    && disk.snapshotId === snapshotId
    && disk.keys.length > 0
    && disk.keys.every(key => Boolean(disk!.perSong[key]))
  ) {
    const items = materializeCachedItems(disk)
    console.info(
      `${withRequestCtx(event, '[spotdl]')} resolve cache HARD hit ${resource.kind}=${resource.id} (snapshot ${snapshotId.slice(0, 12)}…) -> ${items.length} items in ${Date.now() - startedAt}ms`,
    )
    const value: SpotifyResolveResponse = {
      playlist: {
        id: resource.id,
        title: summary?.name || 'Spotify playlist',
        channelTitle: summary?.ownerName || 'Spotify',
        itemCount: summary?.trackCount ?? items.length,
        spotifyId: resource.id,
        spotifyUrl: resource.url,
      },
      items,
      unmatched: 0,
      resolver: 'spotdl',
    }
    resolveCache.set(cacheKey, { until: Date.now() + RESOLVE_CACHE_MS, value })
    return value
  }

  // Fast metadata-only pass (no YTM search) — needed for keys/identity.
  const metadataSongs = await runSpotdlSave(event, resource, { preload: false })
  const keys = cacheKeysForSongs(metadataSongs)
  const { reusable, missing } = splitReusableKeys(disk, metadataSongs)

  const merged: Record<string, CachedSpotResolveItem> = {}
  let mode: 'soft' | 'incremental' | 'full' = 'full'

  if (missing.length === 0) {
    // Soft hit: every current song has a cached mapping — skip the preload pass.
    for (const key of reusable) merged[key] = disk!.perSong[key]
    mode = 'soft'
    console.info(
      `${withRequestCtx(event, '[spotdl]')} resolve cache SOFT hit ${resource.kind}=${resource.id} -> ${keys.length} items reused`,
    )
  }
  else if (reusable.length > 0 && missing.length <= SPOTIFY_RESOLVE_INCREMENTAL_MAX_PRELOAD) {
    // Incremental: preload only the few new/changed tracks individually.
    const notYet = new Set(missing)
    for (const key of reusable) merged[key] = disk!.perSong[key]

    for (const key of missing) {
      const index = keys.indexOf(key)
      const meta = metadataSongs[index]
      const trackUrl = typeof meta?.url === 'string' && meta.url.trim() ? meta.url.trim() : ''
      if (!trackUrl) continue
      const trackRef = parseSpotifyResource(trackUrl)
      if (!trackRef) continue
      try {
        const resolved = await runSpotdlSave(event, trackRef, { preload: true })
        const item = spotdlSongToImportItem(resolved[0] ?? null, index)
        if (item) {
          merged[key] = { ...item, matchedBy: 'spotdl' }
          notYet.delete(key)
        }
        else {
          console.info(
            `${withRequestCtx(event, '[spotdl]')} incremental preload left "${spotdlSongTitle(meta ?? {})}" unmatched`,
          )
        }
      }
      catch (err) {
        console.warn(
          `${withRequestCtx(event, '[spotdl]')} incremental preload failed for "${spotdlSongTitle(meta ?? {})}": ${err instanceof Error ? err.message : String(err)}`,
        )
      }
    }

    const fallback = await youtubeFallbackForUnmatchedSongs(
      event,
      metadataSongs,
      new Set(keys.filter(key => !notYet.has(key))),
    )
    for (const fb of fallback.items) {
      const key = keys[fb.position - 1]
      if (key && !merged[key]) {
        merged[key] = { ...fb, matchedBy: 'yt-fallback' }
        notYet.delete(key)
      }
    }
    mode = 'incremental'
    console.info(
      `${withRequestCtx(event, '[spotdl]')} resolve cache INCREMENTAL reuse for ${resource.kind}=${resource.id}: ${missing.length} new (${notYet.size} still unmatched), ${reusable.length} reused`,
    )
  }
  else {
    // Cold / too much change — one full preload pass (legacy behavior).
    const preloadSongs = await runSpotdlSave(event, resource, { preload: true })
    const matched = new Set<string>()
    preloadSongs.forEach((song, index) => {
      const item = spotdlSongToImportItem(song, index)
      const key = keys[index]
      if (item && key) {
        merged[key] = { ...item, matchedBy: 'spotdl' }
        matched.add(key)
      }
    })

    const fallback = await youtubeFallbackForUnmatchedSongs(event, metadataSongs, matched)
    for (const fb of fallback.items) {
      const key = keys[fb.position - 1]
      if (key && !merged[key]) merged[key] = { ...fb, matchedBy: 'yt-fallback' }
    }
    mode = 'full'
    console.info(
      `${withRequestCtx(event, '[spotdl]')} resolve done ${resource.kind}=${resource.id} in ${Date.now() - startedAt}ms (full pass, yt fallback found ${fallback.found}${fallback.skipped ? ', SKIPPED' : ''})`,
    )
  }

  const items = keys
    .map((key, index) => (merged[key] ? importItemFromCached(merged[key], index) : null))
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
  const unmatched = keys.length - items.length

  // Persist so the next resolve can hard/soft-hit.
  await writeSpotifyResolveCache(event, resource.kind, resource.id, {
    version: SPOTIFY_RESOLVE_CACHE_VERSION,
    kind: resource.kind,
    id: resource.id,
    snapshotId,
    keys,
    perSong: merged,
    updatedAt: Date.now(),
  })

  let playlist: SpotifyResolveResponse['playlist']
  if (resource.kind === 'playlist') {
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
    const albumName = metadataSongs[0]?.album_name?.trim()
    playlist = {
      id: resource.id,
      title: albumName || spotdlSongTitle(metadataSongs[0] || {}) || 'Spotify album',
      channelTitle: spotdlArtistLabel(metadataSongs[0] || {}),
      itemCount: items.length + unmatched,
      spotifyId: resource.id,
      spotifyUrl: resource.url,
    }
  }
  else {
    playlist = {
      id: resource.id,
      title: spotdlSongTitle(metadataSongs[0] || {}) || 'Spotify track',
      channelTitle: spotdlArtistLabel(metadataSongs[0] || {}),
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
  console.info(
    `${withRequestCtx(event, '[spotdl]')} resolve finish (${mode}) ${resource.kind}=${resource.id} -> ${items.length} items, ${unmatched} unmatched`,
  )
  return value
}
