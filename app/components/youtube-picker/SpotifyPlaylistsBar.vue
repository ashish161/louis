<script setup lang="ts">
import { useSpotify } from '~/composables/useSpotify'
import type { SpotifyPlaylistSummary } from '#shared/spotifyTypes'

const emit = defineEmits<{
  select: [playlist: SpotifyPlaylistSummary]
}>()

const {
  status,
  playlists,
  playlistsNextOffset,
  loadingStatus,
  loadingPlaylists,
  errorMessage,
  refreshStatus,
  loadPlaylists,
  loadMorePlaylists,
  connect,
  disconnect,
} = useSpotify()

const { playEvent } = useUiSound()
const { showError } = useToast()
const route = useRoute()
const router = useRouter()

const expanded = ref(false)
const redirectCopied = ref(false)
let redirectCopiedTimer: ReturnType<typeof setTimeout> | null = null

function copyRedirectUri() {
  const uri = status.value?.redirectUri
  if (!uri) return
  void navigator.clipboard.writeText(uri).then(() => {
    redirectCopied.value = true
    if (redirectCopiedTimer) clearTimeout(redirectCopiedTimer)
    redirectCopiedTimer = setTimeout(() => {
      redirectCopied.value = false
    }, 2000)
  })
}

const showTray = computed(() => Boolean(status.value?.configured))

async function bootstrap() {
  await refreshStatus()
  if (status.value?.connected) {
    await loadPlaylists()
  }
}

function onConnect() {
  playEvent('buttonPrimary')
  connect()
}

async function onDisconnect() {
  playEvent('buttonClick')
  await disconnect()
}

function onSelect(playlist: SpotifyPlaylistSummary) {
  playEvent('buttonClick')
  emit('select', playlist)
}

async function onToggle() {
  playEvent('buttonClick')
  expanded.value = !expanded.value
  if (expanded.value && status.value?.connected && playlists.value.length === 0) {
    await loadPlaylists()
  }
}

async function clearSpotifyQuery() {
  const nextQuery = { ...route.query }
  let changed = false
  if ('spotify_connected' in nextQuery) {
    delete nextQuery.spotify_connected
    changed = true
  }
  if ('spotify_error' in nextQuery) {
    delete nextQuery.spotify_error
    changed = true
  }
  if (changed) await router.replace({ query: nextQuery })
}

watch(
  () => [route.query.spotify_connected, route.query.spotify_error] as const,
  async ([connectedFlag, errorFlag]) => {
    if (connectedFlag === '1') {
      await refreshStatus()
      await loadPlaylists()
      expanded.value = true
      await clearSpotifyQuery()
      return
    }
    if (typeof errorFlag === 'string' && errorFlag) {
      showError(`Spotify: ${errorFlag}`)
      await clearSpotifyQuery()
    }
  },
  { immediate: true },
)

watch(errorMessage, (msg) => {
  if (msg) showError(msg)
})

onMounted(() => {
  void bootstrap()
})
</script>

<template>
  <div
    v-if="showTray"
    class="spotify-tray rounded-maru border-maru bg-white/70 px-3 py-2"
  >
    <div class="flex flex-wrap items-center gap-2 justify-between">
      <div class="flex items-center gap-2 min-w-0">
        <button
          type="button"
          class="type-meta font-semibold text-left truncate"
          :disabled="loadingStatus"
          @click="onToggle"
        >
          Spotify{{ status?.connected ? '' : ' (optional)' }}
          <span class="opacity-60">{{ expanded ? '▾' : '▸' }}</span>
        </button>
        <span
          v-if="status && !status.spotdlAvailable"
          class="type-meta text-maru-red shrink-0"
          title="Install spotDL to resolve Spotify playlists to YouTube"
        >
          spotDL missing
        </span>
      </div>

      <div class="flex items-center gap-2 shrink-0">
        <button
          v-if="!status?.connected"
          type="button"
          class="maru-button maru-button--sm"
          :disabled="loadingStatus"
          @click="onConnect"
        >
          <span class="maru-button__label">Connect</span>
        </button>
        <button
          v-else
          type="button"
          class="type-meta underline opacity-70 hover:opacity-100"
          @click="onDisconnect"
        >
          Disconnect
        </button>
      </div>
    </div>

    <div
      v-if="expanded"
      class="mt-2 flex flex-col gap-2"
    >
      <p
        v-if="!status?.connected"
        class="type-meta opacity-70"
      >
        <strong>No redirect URI?</strong> Paste a public Spotify playlist URL in Search — Client ID + secret in <code class="text-xs">.env</code> is enough.
        <strong>Connect</strong> needs an <strong>HTTPS</strong> redirect in the Spotify Dashboard (HTTP is often rejected). See <code class="text-xs">docs/SPOTIFY.md</code> (mkcert or Cloudflare tunnel).
      </p>
      <div
        v-if="!status?.connected && status?.redirectUri"
        class="type-meta flex flex-wrap items-center gap-2"
      >
        <span class="opacity-70">Register in Spotify Dashboard:</span>
        <code class="text-xs break-all">{{ status.redirectUri }}</code>
        <button
          type="button"
          class="type-meta underline shrink-0"
          @click="copyRedirectUri"
        >
          {{ redirectCopied ? 'Copied' : 'Copy' }}
        </button>
      </div>

      <p
        v-if="!status?.connected"
        class="type-meta"
      >
        Connect once to list your playlists. Public playlist URLs work without Connect when credentials are set.
      </p>

      <div
        v-else-if="loadingPlaylists && playlists.length === 0"
        class="type-meta opacity-70"
      >
        Loading playlists…
      </div>

      <ul
        v-else-if="playlists.length > 0"
        class="spotify-tray__list flex flex-col gap-1 max-h-40 overflow-y-auto"
      >
        <li
          v-for="playlist in playlists"
          :key="playlist.id"
        >
          <button
            type="button"
            class="w-full text-left rounded-maru px-2 py-1.5 hover:bg-maru-yellow-light transition-colors"
            @click="onSelect(playlist)"
          >
            <span class="block type-meta font-semibold truncate">{{ playlist.name }}</span>
            <span class="block type-meta opacity-60 truncate">
              {{ playlist.trackCount != null ? `${playlist.trackCount} tracks` : 'Playlist' }}
              <template v-if="playlist.ownerName"> · {{ playlist.ownerName }}</template>
            </span>
          </button>
        </li>
      </ul>

      <button
        v-if="playlistsNextOffset != null"
        type="button"
        class="type-meta underline self-start"
        :disabled="loadingPlaylists"
        @click="loadMorePlaylists"
      >
        {{ loadingPlaylists ? 'Loading…' : 'Load more playlists' }}
      </button>
    </div>
  </div>
</template>
