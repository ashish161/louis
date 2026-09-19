import type { H3Event } from 'h3'
import type { SpotifyPlaylistSummary } from '../../shared/spotifyTypes.ts'
import { spotifyOpenUrl } from '../../shared/spotifyUrl.ts'
import {
  clearSpotifyAccessTokenCookie,
  clearSpotifyAuthCookies,
  exchangeSpotifyCode,
  getSpotifyAccessTokenCookie,
  getSpotifyClientCredentialsToken,
  getSpotifyRefreshTokenCookie,
  refreshSpotifyAccessToken,
  setSpotifyAccessTokenCookie,
  setSpotifyRefreshTokenCookie,
  type SpotifyConfig,
} from './spotify-auth'
import { SPOTIFY_API_BASE_URL } from './spotify-auth'
import { resolveSpotifyRedirectUri } from '../../shared/spotifyRedirect.ts'

export function getSpotifyRedirectUri(event: H3Event): string {
  const config = useRuntimeConfig(event)
  const url = getRequestURL(event)
  return resolveSpotifyRedirectUri(
    url.origin,
    String(config.spotifyRedirectUri ?? ''),
  )
}

export function getSpotifyConfig(event: H3Event): SpotifyConfig {
  const config = useRuntimeConfig(event)
  const clientId = String(config.spotifyClientId ?? '').trim()
  const clientSecret = String(config.spotifyClientSecret ?? '').trim()
  const redirectUri = getSpotifyRedirectUri(event)

  if (!clientId || !clientSecret) {
    throw createError({
      statusCode: 503,
      statusMessage:
        'Spotify not configured. Set LOUIS_SPOTIFY_CLIENT_ID and LOUIS_SPOTIFY_CLIENT_SECRET in .env',
    })
  }

  return { clientId, clientSecret, redirectUri }
}

export function isSpotifyConfigured(event: H3Event): boolean {
  const config = useRuntimeConfig(event)
  return Boolean(
    String(config.spotifyClientId ?? '').trim()
    && String(config.spotifyClientSecret ?? '').trim(),
  )
}

export function isSpotifyConnected(event: H3Event): boolean {
  return Boolean(
    getSpotifyRefreshTokenCookie(event) || getSpotifyAccessTokenCookie(event),
  )
}

const refreshInFlight = new Map<string, Promise<string>>()

export async function getSpotifyUserAccessToken(event: H3Event): Promise<string> {
  const access = getSpotifyAccessTokenCookie(event)?.trim()
  if (access) return access

  const refresh = getSpotifyRefreshTokenCookie(event)?.trim()
  if (!refresh) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Connect Spotify to list your playlists.',
    })
  }

  const existing = refreshInFlight.get(refresh)
  if (existing) return existing

  const config = getSpotifyConfig(event)
  const pending = refreshSpotifyAccessToken(config, refresh)
    .then((tokens) => {
      setSpotifyAccessTokenCookie(event, tokens.access_token, tokens.expires_in)
      if (tokens.refresh_token) {
        setSpotifyRefreshTokenCookie(event, tokens.refresh_token)
      }
      return tokens.access_token
    })
    .catch((err) => {
      clearSpotifyAuthCookies(event)
      throw err
    })
    .finally(() => {
      refreshInFlight.delete(refresh)
    })

  refreshInFlight.set(refresh, pending)
  return pending
}

export async function completeSpotifyAuth(
  event: H3Event,
  code: string,
): Promise<void> {
  const config = getSpotifyConfig(event)
  const tokens = await exchangeSpotifyCode(config, code)
  setSpotifyAccessTokenCookie(event, tokens.access_token, tokens.expires_in)
  if (tokens.refresh_token) {
    setSpotifyRefreshTokenCookie(event, tokens.refresh_token)
  }
  else {
    // Spotify may omit refresh on re-consent; keep existing if present.
  }
}

export function disconnectSpotify(event: H3Event) {
  clearSpotifyAuthCookies(event)
  clearSpotifyAccessTokenCookie(event)
}

interface SpotifyImage {
  url?: string
  height?: number | null
  width?: number | null
}

interface SpotifyPlaylistApiItem {
  id?: string
  name?: string
  description?: string | null
  images?: SpotifyImage[]
  tracks?: { total?: number }
  owner?: { display_name?: string | null }
  external_urls?: { spotify?: string }
  snapshot_id?: string
}

interface SpotifyPlaylistsPage {
  items?: SpotifyPlaylistApiItem[]
  next?: string | null
  total?: number
}

function pickImage(images: SpotifyImage[] | undefined): string | undefined {
  if (!images?.length) return undefined
  const sorted = [...images].sort(
    (a, b) => (a.width ?? 0) - (b.width ?? 0),
  )
  // Prefer a mid-size cover when available.
  const mid = sorted.find(img => (img.width ?? 0) >= 200) ?? sorted.at(-1)
  return mid?.url?.trim() || undefined
}

function mapPlaylist(item: SpotifyPlaylistApiItem): SpotifyPlaylistSummary | null {
  const id = item.id?.trim()
  const name = item.name?.trim()
  if (!id || !name) return null
  return {
    id,
    name,
    description: item.description?.trim() || undefined,
    trackCount: item.tracks?.total,
    imageUrl: pickImage(item.images),
    ownerName: item.owner?.display_name?.trim() || undefined,
    url: item.external_urls?.spotify?.trim() || spotifyOpenUrl('playlist', id),
    snapshotId: item.snapshot_id?.trim() || undefined,
  }
}

/** One page of the current user's playlists (token-efficient: caller pages only as needed). */
export async function listSpotifyUserPlaylists(
  event: H3Event,
  options?: { limit?: number, offset?: number },
): Promise<{ items: SpotifyPlaylistSummary[], total: number, nextOffset?: number }> {
  const token = await getSpotifyUserAccessToken(event)
  const limit = Math.min(Math.max(options?.limit ?? 50, 1), 50)
  const offset = Math.max(options?.offset ?? 0, 0)
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  })

  const page = await $fetch<SpotifyPlaylistsPage>(
    `${SPOTIFY_API_BASE_URL}/me/playlists?${params}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  )

  const items = (page.items ?? [])
    .map(mapPlaylist)
    .filter((p): p is SpotifyPlaylistSummary => Boolean(p))

  const total = page.total ?? items.length
  const nextOffset = page.next ? offset + limit : undefined
  return { items, total, nextOffset }
}

export async function fetchSpotifyPlaylistSummary(
  event: H3Event,
  playlistId: string,
): Promise<SpotifyPlaylistSummary | null> {
  const config = getSpotifyConfig(event)
  // Prefer user token (private playlists); fall back to client credentials for public.
  let token: string
  try {
    token = await getSpotifyUserAccessToken(event)
  }
  catch {
    token = await getSpotifyClientCredentialsToken(config)
  }

  try {
    const item = await $fetch<SpotifyPlaylistApiItem>(
      `${SPOTIFY_API_BASE_URL}/playlists/${encodeURIComponent(playlistId)}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        query: { fields: 'id,name,description,images,tracks.total,owner.display_name,external_urls,snapshot_id' },
      },
    )
    return mapPlaylist(item)
  }
  catch {
    return null
  }
}
