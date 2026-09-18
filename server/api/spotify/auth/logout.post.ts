import { disconnectSpotify } from '../../../utils/spotify'

export default defineEventHandler((event) => {
  disconnectSpotify(event)
  return { ok: true }
})
