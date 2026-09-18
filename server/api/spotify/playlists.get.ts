import {
  isSpotifyConfigured,
  isSpotifyConnected,
  listSpotifyUserPlaylists,
} from '../../utils/spotify'

export default defineEventHandler(async (event) => {
  if (!isSpotifyConfigured(event)) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Spotify not configured',
    })
  }
  if (!isSpotifyConnected(event)) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Connect Spotify to list your playlists',
    })
  }

  const query = getQuery(event)
  const limit = query.limit ? Number(query.limit) : 50
  const offset = query.offset ? Number(query.offset) : 0

  return await listSpotifyUserPlaylists(event, {
    limit: Number.isFinite(limit) ? limit : 50,
    offset: Number.isFinite(offset) ? offset : 0,
  })
})
