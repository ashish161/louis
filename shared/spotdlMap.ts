import type { YoutubePlaylistImportItem } from './myo-editor/youtubePlaylistImport.ts'
import { extractYoutubeIdFromUrl } from './myo-editor/youtubeUrl.ts'

export interface SpotdlSong {
  name?: string
  title?: string
  artists?: string[] | string
  artist?: string
  album_name?: string
  duration?: number | string
  url?: string
  song_id?: string
  cover_url?: string
  coverUrl?: string
  download_url?: string | null
  downloadUrl?: string | null
  list_position?: number
}

function artistLabel(song: SpotdlSong): string {
  if (typeof song.artist === 'string' && song.artist.trim()) return song.artist.trim()
  if (Array.isArray(song.artists)) {
    return song.artists.map(a => String(a).trim()).filter(Boolean).join(', ')
  }
  if (typeof song.artists === 'string' && song.artists.trim()) return song.artists.trim()
  return 'Spotify'
}

export function spotdlSongTitle(song: SpotdlSong): string {
  return (song.name || song.title || 'Unknown track').trim() || 'Unknown track'
}

export function spotdlArtistLabel(song: SpotdlSong): string {
  return artistLabel(song)
}

function songDurationSeconds(song: SpotdlSong): number | undefined {
  const raw = song.duration
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    return Math.round(raw)
  }
  if (typeof raw === 'string') {
    const n = Number(raw)
    if (Number.isFinite(n) && n > 0) return Math.round(n)
  }
  return undefined
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function downloadUrlOf(song: SpotdlSong): string | null {
  const url = song.download_url ?? song.downloadUrl
  return typeof url === 'string' && url.trim() ? url.trim() : null
}

/** spotDL sometimes emits youtu.be / music.youtube.com without https. */
function extractYoutubeIdFromWatchLoose(value: string): string | null {
  const trimmed = value.trim()
  if (/^[\w-]{11}$/.test(trimmed)) return trimmed
  try {
    const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
    return extractYoutubeIdFromUrl(withProto)
  }
  catch {
    return null
  }
}

function youtubeIdFromSong(song: SpotdlSong): string | null {
  const downloadUrl = downloadUrlOf(song)
  if (!downloadUrl) return null
  return extractYoutubeIdFromUrl(downloadUrl)
    || extractYoutubeIdFromWatchLoose(downloadUrl)
}

export function mapSpotdlSongsToImportItems(
  songs: SpotdlSong[],
): { items: YoutubePlaylistImportItem[], unmatched: number } {
  const items: YoutubePlaylistImportItem[] = []
  let unmatched = 0

  songs.forEach((rawSong, index) => {
    // spotDL occasionally emits null entries (unresolvable on YouTube).
    const song = rawSong ?? {}
    const videoId = youtubeIdFromSong(song)
    if (!videoId) {
      unmatched += 1
      return
    }
    const durationSeconds = songDurationSeconds(song)
    const position = typeof song.list_position === 'number'
      ? song.list_position
      : index
    const spotifyUrl = typeof song.url === 'string' ? song.url : ''
    const playlistItemId = song.song_id?.trim()
      || (spotifyUrl ? `spotify:${spotifyUrl}` : `spotdl:${index}:${videoId}`)

    items.push({
      playlistItemId,
      videoId,
      position,
      title: spotdlSongTitle(song),
      channelTitle: artistLabel(song),
      thumbnailUrl: (song.cover_url || song.coverUrl || '').trim(),
      duration: durationSeconds !== undefined ? formatDuration(durationSeconds) : undefined,
      durationSeconds,
      available: true,
    })
  })

  return { items, unmatched }
}

export function parseSpotdlSaveJson(raw: string): SpotdlSong[] {
  const trimmed = raw.trim()
  if (!trimmed) return []
  const parsed = JSON.parse(trimmed) as unknown
  if (Array.isArray(parsed)) return parsed as SpotdlSong[]
  if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { songs?: unknown }).songs)) {
    return (parsed as { songs: SpotdlSong[] }).songs
  }
  throw new Error('Unexpected spotDL save format')
}
