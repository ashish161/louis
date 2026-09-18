const SPOTIFY_HOSTS = new Set([
  'open.spotify.com',
  'play.spotify.com',
  'spotify.link',
])

const SPOTIFY_ID = /^[A-Za-z0-9]{10,30}$/

export type SpotifyResourceKind = 'playlist' | 'album' | 'track'

export interface SpotifyResourceRef {
  kind: SpotifyResourceKind
  id: string
  /** Canonical open.spotify.com URL without query clutter. */
  url: string
}

export function isSpotifyId(value: string): boolean {
  return SPOTIFY_ID.test(value)
}

export function spotifyOpenUrl(kind: SpotifyResourceKind, id: string): string {
  return `https://open.spotify.com/${kind}/${id}`
}

/**
 * Parse a Spotify playlist/album/track URL or URI.
 * Accepts open.spotify.com links and spotify:playlist:… URIs.
 */
export function parseSpotifyResource(value: string): SpotifyResourceRef | null {
  const raw = value.trim()
  if (!raw) return null

  const uriMatch = raw.match(/^spotify:(playlist|album|track):([A-Za-z0-9]{10,30})$/i)
  if (uriMatch?.[1] && uriMatch[2]) {
    const kind = uriMatch[1].toLowerCase() as SpotifyResourceKind
    const id = uriMatch[2]
    return { kind, id, url: spotifyOpenUrl(kind, id) }
  }

  let url: URL
  try {
    url = new URL(raw)
  }
  catch {
    return null
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  const host = url.hostname.replace(/^www\./i, '').toLowerCase()
  if (!SPOTIFY_HOSTS.has(host)) return null

  const segments = url.pathname.split('/').filter(Boolean)
  // /playlist/…/<kind>/<id> or /intl-xx/<kind>/<id> or /<kind>/<id>
  let kindIdx = -1
  for (let i = 0; i < segments.length; i += 1) {
    const seg = segments[i]?.toLowerCase()
    if (seg === 'playlist' || seg === 'album' || seg === 'track') {
      kindIdx = i
      break
    }
  }
  if (kindIdx < 0) return null

  const kind = segments[kindIdx]!.toLowerCase() as SpotifyResourceKind
  const id = (segments[kindIdx + 1] ?? '').split('?')[0]?.trim() ?? ''
  if (!isSpotifyId(id)) return null

  return { kind, id, url: spotifyOpenUrl(kind, id) }
}

export function parseSpotifyPlaylistUrl(value: string): string | null {
  const parsed = parseSpotifyResource(value)
  return parsed?.kind === 'playlist' ? parsed.id : null
}
