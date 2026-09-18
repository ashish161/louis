import type { H3Event } from 'h3'
import { isYotoCookieSecure } from './yoto-auth'

export const SPOTIFY_AUTH_BASE_URL = 'https://accounts.spotify.com'
export const SPOTIFY_API_BASE_URL = 'https://api.spotify.com/v1'
/** playlist-read scopes only — local playlist import, no playback control. */
export const SPOTIFY_SCOPES = 'playlist-read-private playlist-read-collaborative'

export const SPOTIFY_ACCESS_TOKEN_COOKIE = 'spotify_access_token'
export const SPOTIFY_REFRESH_TOKEN_COOKIE = 'spotify_refresh_token'
export const SPOTIFY_OAUTH_STATE_COOKIE = 'spotify_oauth_state'

export interface SpotifyConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
}

export interface SpotifyTokenResponse {
  access_token: string
  token_type: string
  expires_in: number
  refresh_token?: string
  scope?: string
}

function cookieSecure(): boolean {
  return isYotoCookieSecure()
}

export function buildSpotifyAuthorizeUrl(
  config: SpotifyConfig,
  state: string,
): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    response_type: 'code',
    redirect_uri: config.redirectUri,
    scope: SPOTIFY_SCOPES,
    state,
    show_dialog: 'false',
  })
  return `${SPOTIFY_AUTH_BASE_URL}/authorize?${params.toString()}`
}

async function postSpotifyToken(
  config: SpotifyConfig,
  body: Record<string, string>,
): Promise<SpotifyTokenResponse> {
  const basic = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')
  try {
    return await $fetch<SpotifyTokenResponse>(`${SPOTIFY_AUTH_BASE_URL}/api/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(body).toString(),
    })
  }
  catch (err: unknown) {
    const e = err as {
      statusCode?: number
      statusMessage?: string
      message?: string
      data?: { error?: string, error_description?: string }
    }
    throw createError({
      statusCode: e.statusCode === 401 ? 401 : 502,
      message: e.data?.error_description
        ?? e.statusMessage
        ?? e.message
        ?? 'Spotify token exchange failed',
    })
  }
}

export async function exchangeSpotifyCode(
  config: SpotifyConfig,
  code: string,
): Promise<SpotifyTokenResponse> {
  return postSpotifyToken(config, {
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.redirectUri,
  })
}

export async function refreshSpotifyAccessToken(
  config: SpotifyConfig,
  refreshToken: string,
): Promise<SpotifyTokenResponse> {
  return postSpotifyToken(config, {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  })
}

/** Client-credentials token for public playlist metadata (no user cookies). */
export async function getSpotifyClientCredentialsToken(
  config: SpotifyConfig,
): Promise<string> {
  const tokens = await postSpotifyToken(config, {
    grant_type: 'client_credentials',
  })
  return tokens.access_token
}

export function setSpotifyOAuthStateCookie(event: H3Event, state: string) {
  setCookie(event, SPOTIFY_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: 'lax',
    maxAge: 60 * 10,
    path: '/',
  })
}

export function getSpotifyOAuthStateCookie(event: H3Event): string | undefined {
  return getCookie(event, SPOTIFY_OAUTH_STATE_COOKIE)
}

export function clearSpotifyOAuthStateCookie(event: H3Event) {
  deleteCookie(event, SPOTIFY_OAUTH_STATE_COOKIE, { path: '/' })
}

export function setSpotifyAccessTokenCookie(
  event: H3Event,
  accessToken: string,
  expiresIn: number,
) {
  setCookie(event, SPOTIFY_ACCESS_TOKEN_COOKIE, accessToken, {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: 'lax',
    maxAge: Math.max(expiresIn - 60, 60),
    path: '/',
  })
}

export function getSpotifyAccessTokenCookie(event: H3Event): string | undefined {
  return getCookie(event, SPOTIFY_ACCESS_TOKEN_COOKIE)
}

export function clearSpotifyAccessTokenCookie(event: H3Event) {
  deleteCookie(event, SPOTIFY_ACCESS_TOKEN_COOKIE, { path: '/' })
}

export function setSpotifyRefreshTokenCookie(event: H3Event, refreshToken: string) {
  setCookie(event, SPOTIFY_REFRESH_TOKEN_COOKIE, refreshToken, {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
    path: '/',
  })
}

export function getSpotifyRefreshTokenCookie(event: H3Event): string | undefined {
  return getCookie(event, SPOTIFY_REFRESH_TOKEN_COOKIE)
}

export function clearSpotifyRefreshTokenCookie(event: H3Event) {
  deleteCookie(event, SPOTIFY_REFRESH_TOKEN_COOKIE, { path: '/' })
}

export function clearSpotifyAuthCookies(event: H3Event) {
  clearSpotifyOAuthStateCookie(event)
  clearSpotifyAccessTokenCookie(event)
  clearSpotifyRefreshTokenCookie(event)
}
