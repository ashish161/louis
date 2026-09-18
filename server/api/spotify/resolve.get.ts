import { isSpotifyConfigured } from '../../utils/spotify'
import { resolveSpotifyResourceToYoutube } from '../../utils/spotdl'

export default defineEventHandler(async (event) => {
  if (!isSpotifyConfigured(event)) {
    throw createError({
      statusCode: 503,
      statusMessage:
        'Spotify not configured. Set LOUIS_SPOTIFY_CLIENT_ID and LOUIS_SPOTIFY_CLIENT_SECRET in .env',
    })
  }

  const query = getQuery(event)
  const url = String(query.url ?? query.playlistUrl ?? '').trim()
  const playlistId = String(query.playlistId ?? '').trim()
  const refresh = query.refresh === '1' || query.refresh === 'true'

  const target = url
    || (playlistId ? `https://open.spotify.com/playlist/${playlistId}` : '')

  if (!target) {
    throw createError({
      statusCode: 400,
      statusMessage: 'url or playlistId is required',
    })
  }

  return await resolveSpotifyResourceToYoutube(event, target, {
    bypassCache: refresh,
  })
})
