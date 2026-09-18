/**
 * Spotify redirect URI rules (2025+):
 * - HTTPS required except loopback IP literals
 * - `localhost` is NOT allowed — use http://127.0.0.1:PORT
 * @see https://developer.spotify.com/documentation/web-api/concepts/redirect_uri
 */
export function normalizeSpotifyLoopbackOrigin(origin: string): string {
  let url: URL
  try {
    url = new URL(origin)
  }
  catch {
    return origin
  }

  const host = url.hostname.toLowerCase()
  if (host === 'localhost' || host === '::1' || host === '[::1]') {
    url.hostname = '127.0.0.1'
  }

  return url.origin
}

export function resolveSpotifyRedirectUri(origin: string, pinned?: string): string {
  const trimmed = pinned?.trim()
  if (trimmed) return trimmed

  const normalized = normalizeSpotifyLoopbackOrigin(origin)
  return `${normalized}/api/spotify/auth/callback`
}
