import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { H3Event } from 'h3'
import type { SpotifyResolveCacheEntry } from '../../shared/spotifyResolveCache.ts'
import { SPOTIFY_RESOLVE_CACHE_VERSION } from '../../shared/spotifyResolveCache.ts'
import type { SpotifyPlaylistSummary } from '../../shared/spotifyTypes.ts'
import { resolveAudioWorkDirConfig } from './audio-work-dir'
import { fetchSpotifyPlaylistSummary } from './spotify'

/** Persistent resolve cache — survives sweeps (sweep only prunes cache/preview + cache/save). */
function cacheRoot(event: H3Event): string {
  return path.join(resolveAudioWorkDirConfig(event).audioWorkDir, 'cache', 'spotify')
}

export function spotifyResolveCachePath(
  event: H3Event,
  kind: 'playlist' | 'album' | 'track',
  id: string,
): string {
  return path.join(cacheRoot(event), kind, `${id}.json`)
}

export async function loadSpotifyResolveCache(
  event: H3Event,
  kind: 'playlist' | 'album' | 'track',
  id: string,
): Promise<SpotifyResolveCacheEntry | null> {
  try {
    const raw = await readFile(spotifyResolveCachePath(event, kind, id), 'utf8')
    const parsed = JSON.parse(raw) as Partial<SpotifyResolveCacheEntry>
    if (!parsed || parsed.version !== SPOTIFY_RESOLVE_CACHE_VERSION) return null
    if (parsed.kind !== kind || parsed.id !== id) return null
    if (!Array.isArray(parsed.keys) || !parsed.perSong || typeof parsed.perSong !== 'object') {
      return null
    }
    return parsed as SpotifyResolveCacheEntry
  }
  catch {
    return null
  }
}

export async function writeSpotifyResolveCache(
  event: H3Event,
  kind: 'playlist' | 'album' | 'track',
  id: string,
  entry: SpotifyResolveCacheEntry,
): Promise<void> {
  const dest = spotifyResolveCachePath(event, kind, id)
  await mkdir(path.dirname(dest), { recursive: true })
  const tmp = `${dest}.tmp-${process.pid}-${Date.now()}`
  await writeFile(tmp, JSON.stringify(entry), 'utf8')
  await rename(tmp, dest).catch(async () => {
    await rm(tmp, { force: true }).catch(() => {})
    await writeFile(dest, JSON.stringify(entry), 'utf8')
  })
}

/** Merge a fresh snapshotId into the cache (preserves existing perSong mappings). */
export async function touchSpotifyResolveSnapshot(
  event: H3Event,
  kind: 'playlist' | 'album' | 'track',
  id: string,
  snapshotId?: string,
): Promise<void> {
  if (!snapshotId) return
  const existing = await loadSpotifyResolveCache(event, kind, id)
  await writeSpotifyResolveCache(event, kind, id, {
    version: SPOTIFY_RESOLVE_CACHE_VERSION,
    kind,
    id,
    snapshotId,
    keys: existing?.keys ?? [],
    perSong: existing?.perSong ?? {},
    updatedAt: Date.now(),
  })
}

const lastWarmedAt = new Map<string, number>()
const LAST_WARM_MIN_MS = 5 * 60_000

/**
 * Background snapshot prefetch — after the user's playlists are listed, fetch
 * each playlist's snapshot_id (metadata-only, no YouTube searches) so the next
 * resolve can hard/soft-hit without waiting on the metadata pass. Fire-forget,
 * rate-limited per playlist, never throws.
 */
export async function warmSpotifyResolveSnapshots(
  event: H3Event,
  playlists: SpotifyPlaylistSummary[],
): Promise<void> {
  for (const summary of playlists) {
    const warmed = lastWarmedAt.get(summary.id)
    if (warmed && Date.now() - warmed < LAST_WARM_MIN_MS) continue
    lastWarmedAt.set(summary.id, Date.now())

    const snapshotId = summary.snapshotId
      ?? (await fetchSpotifyPlaylistSummary(event, summary.id).catch(() => null))?.snapshotId
    if (!snapshotId) continue

    const existing = await loadSpotifyResolveCache(event, 'playlist', summary.id)
    if (existing?.snapshotId === snapshotId) continue
    await touchSpotifyResolveSnapshot(event, 'playlist', summary.id, snapshotId)
    console.info(`[spotify] warmed resolve snapshot for ${summary.id} (${snapshotId.slice(0, 12)}…)`)
  }
}