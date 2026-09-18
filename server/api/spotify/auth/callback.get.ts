import {
  clearSpotifyOAuthStateCookie,
  getSpotifyOAuthStateCookie,
} from '../../../utils/spotify-auth'
import { completeSpotifyAuth, isSpotifyConfigured } from '../../../utils/spotify'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const error = typeof query.error === 'string' ? query.error : ''
  const code = typeof query.code === 'string' ? query.code : ''
  const state = typeof query.state === 'string' ? query.state : ''
  const expected = getSpotifyOAuthStateCookie(event)
  clearSpotifyOAuthStateCookie(event)

  if (error) {
    return sendRedirect(event, `/?spotify_error=${encodeURIComponent(error)}`)
  }

  if (!isSpotifyConfigured(event)) {
    return sendRedirect(event, '/?spotify_error=not_configured')
  }

  if (!code || !state || !expected || state !== expected) {
    return sendRedirect(event, '/?spotify_error=invalid_state')
  }

  try {
    await completeSpotifyAuth(event, code)
    return sendRedirect(event, '/?spotify_connected=1')
  }
  catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'auth_failed'
    return sendRedirect(event, `/?spotify_error=${encodeURIComponent(message.slice(0, 120))}`)
  }
})
