import type { YoutubePlaylistImportItem } from './myo-editor/youtubePlaylistImport.ts'
import {
  spotdlArtistLabel,
  spotdlSongTitle,
  type SpotdlSong,
} from './spotdlMap.ts'

export const SPOTIFY_RESOLVE_CACHE_VERSION = 1

export type SpotResolveMatchedBy = 'spotdl' | 'yt-fallback'

/** Per-song mapping stored in the resolve cache (superset of the import-item fields). */
export interface CachedSpotResolveItem {
  playlistItemId: string
  videoId: string
  /** 1-based position when the content was captured (position is rederived on reuse). */
  position: number
  title: string
  channelTitle: string
  thumbnailUrl?: string
  duration?: string
  durationSeconds?: number
  available: boolean
  matchedBy: SpotResolveMatchedBy
}

export interface SpotifyResolveCacheEntry {
  version: typeof SPOTIFY_RESOLVE_CACHE_VERSION
  kind: 'playlist' | 'album' | 'track'
  id: string
  /** Spotify snapshot_id (playlists only) — exact content-change signal. */
  snapshotId?: string
  /** Position-ordered song identity keys for the resolved content. */
  keys: string[]
  perSong: Record<string, CachedSpotResolveItem>
  updatedAt: number
}

/**
 * Stable identity key for one dump entry. Spotify track id when spotDL resolved
 * the metadata; otherwise a position-scoped key (`pos:N`). Positional keys are
 * only trusted when the surrounding traffic is structurally identical, so they
 * are re-verified against the current dump before reuse.
 */
export function songResolveKey(song: SpotdlSong | null | undefined, index: number): string {
  const id = (typeof song?.song_id === 'string' ? song.song_id.trim() : '')
  if (id) return id
  return `pos:${songPosition(song, index)}`
}

export function isPositionalResolveKey(key: string): boolean {
  return key.startsWith('pos:')
}

export function songPosition(song: SpotdlSong | null | undefined, index: number): number {
  const pos = song?.list_position
  return typeof pos === 'number' && Number.isFinite(pos) && pos >= 1 ? Math.floor(pos) : index + 1
}

export function cacheKeysForSongs(songs: Array<SpotdlSong | null | undefined>): string[] {
  return songs.map((song, index) => songResolveKey(song, index))
}

/** Positions where the cached payload would be wrong (duration/identity drift). */
export function positionalReuseConflict(
  cached: CachedSpotResolveItem,
  song: SpotdlSong | null | undefined,
): boolean {
  const metaTitle = spotdlSongTitle(song ?? {})
  if (!metaTitle || metaTitle === 'Unknown track') return false
  if (cached.title.toLowerCase() !== metaTitle.toLowerCase()) return true

  const metaArtist = spotdlArtistLabel(song ?? {})
  if (metaArtist && metaArtist !== 'Spotify' && cached.channelTitle.toLowerCase() !== metaArtist.toLowerCase()) {
    return true
  }

  const raw = song?.duration
  const metaDuration = typeof raw === 'number' && Number.isFinite(raw) && raw > 0
    ? Math.round(raw)
    : typeof raw === 'string' && Number.isFinite(Number(raw)) && Number(raw) > 0
      ? Math.round(Number(raw))
      : undefined
  if (metaDuration !== undefined && cached.durationSeconds !== undefined) {
    if (Math.abs(metaDuration - cached.durationSeconds) > 2) return true
  }
  return false
}

export function splitReusableKeys(
  entry: SpotifyResolveCacheEntry | null | undefined,
  songs: Array<SpotdlSong | null | undefined>,
): { reusable: string[], missing: string[] } {
  const keys = cacheKeysForSongs(songs)
  if (!entry) return { reusable: [], missing: keys }

  const reusable: string[] = []
  const missing: string[] = []
  keys.forEach((key, index) => {
    const cached = entry.perSong[key]
    if (!cached) {
      missing.push(key)
      return
    }
    if (isPositionalResolveKey(key) && positionalReuseConflict(cached, songs[index])) {
      missing.push(key)
      return
    }
    reusable.push(key)
  })
  return { reusable, missing }
}

/** Cache-backed item, with position rederived from the live order. */
export function importItemFromCached(
  cached: CachedSpotResolveItem,
  index: number,
): YoutubePlaylistImportItem {
  return {
    playlistItemId: cached.playlistItemId,
    videoId: cached.videoId,
    position: index + 1,
    title: cached.title,
    channelTitle: cached.channelTitle,
    thumbnailUrl: cached.thumbnailUrl,
    duration: cached.duration,
    durationSeconds: cached.durationSeconds,
    available: cached.available,
  }
}

export function materializeCachedItems(
  entry: SpotifyResolveCacheEntry,
): YoutubePlaylistImportItem[] {
  const items: YoutubePlaylistImportItem[] = []
  entry.keys.forEach((key, index) => {
    const cached = entry.perSong[key]
    if (cached) items.push(importItemFromCached(cached, index))
  })
  return items
}