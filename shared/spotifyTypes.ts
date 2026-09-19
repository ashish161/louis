import type { YoutubePlaylistImportItem, YoutubePlaylistSummary } from './youtubePlaylistImport.ts'

export interface SpotifyPlaylistSummary {
  id: string
  name: string
  description?: string
  trackCount?: number
  imageUrl?: string
  ownerName?: string
  url: string
  /** Spotify playlist snapshot_id — exact content-change fingerprint. */
  snapshotId?: string
}

export interface SpotifyResolveResponse {
  playlist?: YoutubePlaylistSummary & {
    spotifyId?: string
    spotifyUrl?: string
  }
  items: YoutubePlaylistImportItem[]
  /** Tracks Spotify listed that spotDL could not match on YouTube. */
  unmatched: number
  resolver: 'spotdl'
}

export interface SpotifyAuthStatus {
  configured: boolean
  connected: boolean
  spotdlAvailable: boolean
  spotdlVersion?: string
  spotdlError?: string
  /** Redirect URI Louis sends to Spotify — register this exactly in the Developer Dashboard. */
  redirectUri?: string
}
