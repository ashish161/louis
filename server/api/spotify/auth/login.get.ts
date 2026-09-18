import { randomBytes } from 'node:crypto'
import {
  buildSpotifyAuthorizeUrl,
  setSpotifyOAuthStateCookie,
} from '../../../utils/spotify-auth'
import { getSpotifyConfig, isSpotifyConfigured } from '../../../utils/spotify'

export default defineEventHandler(async (event) => {
  if (!isSpotifyConfigured(event)) {
    throw createError({
      statusCode: 503,
      statusMessage:
        'Spotify not configured. Set LOUIS_SPOTIFY_CLIENT_ID and LOUIS_SPOTIFY_CLIENT_SECRET in .env',
    })
  }

  const config = getSpotifyConfig(event)
  const state = randomBytes(16).toString('hex')
  setSpotifyOAuthStateCookie(event, state)
  const authorizeUrl = buildSpotifyAuthorizeUrl(config, state)
  return sendRedirect(event, authorizeUrl)
})
