import {
  getSpotifyRedirectUri,
  isSpotifyConfigured,
  isSpotifyConnected,
} from '../../../utils/spotify'
import { getSpotdlStatus } from '../../../utils/spotdl'
import type { SpotifyAuthStatus } from '../../../../shared/spotifyTypes.ts'

export default defineEventHandler(async (event): Promise<SpotifyAuthStatus> => {
  const spotdl = await getSpotdlStatus(event)
  const configured = isSpotifyConfigured(event)
  return {
    configured,
    connected: isSpotifyConnected(event),
    spotdlAvailable: spotdl.available,
    spotdlVersion: spotdl.version,
    spotdlError: spotdl.error,
    redirectUri: configured ? getSpotifyRedirectUri(event) : undefined,
  }
})
