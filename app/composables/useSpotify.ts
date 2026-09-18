import type { SpotifyAuthStatus, SpotifyPlaylistSummary } from '#shared/spotifyTypes'

export function useSpotify() {
  const status = useState<SpotifyAuthStatus | null>('spotify-auth-status', () => null)
  const playlists = useState<SpotifyPlaylistSummary[]>('spotify-playlists', () => [])
  const playlistsTotal = useState<number>('spotify-playlists-total', () => 0)
  const playlistsNextOffset = useState<number | undefined>('spotify-playlists-next', () => undefined)
  const loadingStatus = ref(false)
  const loadingPlaylists = ref(false)
  const errorMessage = ref('')

  async function refreshStatus() {
    loadingStatus.value = true
    try {
      status.value = await $fetch<SpotifyAuthStatus>('/api/spotify/auth/status')
      errorMessage.value = ''
    }
    catch (err: unknown) {
      status.value = {
        configured: false,
        connected: false,
        spotdlAvailable: false,
        spotdlError: err instanceof Error ? err.message : 'status failed',
      }
    }
    finally {
      loadingStatus.value = false
    }
  }

  async function loadPlaylists(options?: { offset?: number, append?: boolean }) {
    if (!status.value?.connected) {
      playlists.value = []
      return
    }
    loadingPlaylists.value = true
    try {
      const data = await $fetch<{
        items: SpotifyPlaylistSummary[]
        total: number
        nextOffset?: number
      }>('/api/spotify/playlists', {
        query: {
          limit: 50,
          offset: options?.offset ?? 0,
        },
      })
      playlists.value = options?.append
        ? [...playlists.value, ...data.items]
        : data.items
      playlistsTotal.value = data.total
      playlistsNextOffset.value = data.nextOffset
      errorMessage.value = ''
    }
    catch (err: unknown) {
      const e = err as { data?: { message?: string }, statusMessage?: string, message?: string }
      errorMessage.value = e.data?.message || e.statusMessage || e.message || 'Could not load Spotify playlists'
      if (!options?.append) playlists.value = []
    }
    finally {
      loadingPlaylists.value = false
    }
  }

  function connect() {
    window.location.href = '/api/spotify/auth/login'
  }

  async function disconnect() {
    await $fetch('/api/spotify/auth/logout', { method: 'POST' })
    playlists.value = []
    playlistsTotal.value = 0
    playlistsNextOffset.value = undefined
    await refreshStatus()
  }

  async function loadMorePlaylists() {
    const offset = playlistsNextOffset.value
    if (offset == null || loadingPlaylists.value) return
    await loadPlaylists({ offset, append: true })
  }

  return {
    status,
    playlists,
    playlistsTotal,
    playlistsNextOffset,
    loadingStatus,
    loadingPlaylists,
    errorMessage,
    refreshStatus,
    loadPlaylists,
    loadMorePlaylists,
    connect,
    disconnect,
  }
}
