import {
  isSpotifyConfigured,
  isSpotifyConnected,
  listSpotifyUserPlaylists,
} from '../../utils/spotify'
import { warmSpotifyResolveSnapshots } from '../../utils/spotify-resolve-cache'

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

  const result = await listSpotifyUserPlaylists(event, {
    limit: Number.isFinite(limit) ? limit : 50,
    offset: Number.isFinite(offset) ? offset : 0,
  })

  // Background, metadata-only snapshot warm so the next resolve hard/soft-hits.
  void warmSpotifyResolveSnapshots(event, result.items).catch(() => {})

  return result
})
