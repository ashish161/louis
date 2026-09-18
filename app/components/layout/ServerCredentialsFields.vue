<script setup lang="ts">
import MaruTooltip from '~/components/ui/MaruTooltip.vue'

const YOTO_DEV_URL = 'https://yoto.dev/get-started/start-here/'
const SPOTIFY_DASHBOARD_URL = 'https://developer.spotify.com/dashboard'

const props = withDefaults(defineProps<{
  disabled?: boolean
  idPrefix?: string
  error?: string
  restartRequired?: boolean
  activeHint?: string
}>(), {
  disabled: false,
  idPrefix: 'server-settings',
  error: '',
  restartRequired: false,
  activeHint: '',
})

const yotoClientId = defineModel<string>('yotoClientId', { default: '' })
const yotoClientSecret = defineModel<string>('yotoClientSecret', { default: '' })
const spotifyClientId = defineModel<string>('spotifyClientId', { default: '' })
const spotifyClientSecret = defineModel<string>('spotifyClientSecret', { default: '' })
const spotifyRedirectUri = defineModel<string>('spotifyRedirectUri', { default: '' })

const yotoId = computed(() => `${props.idPrefix}-yoto-client-id`)
const yotoSecretId = computed(() => `${props.idPrefix}-yoto-client-secret`)
const spotifyId = computed(() => `${props.idPrefix}-spotify-client-id`)
const spotifySecretId = computed(() => `${props.idPrefix}-spotify-client-secret`)
const redirectId = computed(() => `${props.idPrefix}-spotify-redirect-uri`)
</script>

<template>
  <div class="server-credentials">
    <p class="prefs-projector__hint">
      Stored on the server and applied at the next startup. Changes below start working after a restart.
    </p>

    <div class="prefs-projector__field">
      <div class="prefs-projector__label-row">
        <label
          class="prefs-projector__label"
          :for="yotoId"
        >Yoto client ID</label>
        <MaruTooltip
          placement="bottom"
          text="Public PKCE client ID from your Yoto developer app. Leave the client secret empty."
        >
          <button
            type="button"
            class="prefs-projector__help"
            aria-label="About Yoto client ID"
            :disabled="disabled"
          >?</button>
        </MaruTooltip>
      </div>
      <input
        :id="yotoId"
        v-model="yotoClientId"
        class="prefs-projector__input font-maru-mono"
        type="text"
        autocomplete="off"
        spellcheck="false"
        :disabled="disabled"
        placeholder="Public PKCE client from yoto.dev"
      >
      <p class="prefs-projector__hint">
        Prefer Louis’s bundled public client, or create your own
        <strong>public</strong> (PKCE) app at
        <a
          class="prefs-projector__hint-link"
          :href="YOTO_DEV_URL"
          target="_blank"
          rel="noopener noreferrer"
        >yoto.dev</a>. No client secret needed for the default flow.
      </p>
    </div>

    <div class="prefs-projector__field">
      <div class="prefs-projector__label-row">
        <label
          class="prefs-projector__label"
          :for="yotoSecretId"
        >Yoto client secret (optional)</label>
        <MaruTooltip
          placement="bottom"
          text="Only for confidential Yoto server clients. Leave empty for the public PKCE flow."
        >
          <button
            type="button"
            class="prefs-projector__help"
            aria-label="About Yoto client secret"
            :disabled="disabled"
          >?</button>
        </MaruTooltip>
      </div>
      <input
        :id="yotoSecretId"
        v-model="yotoClientSecret"
        class="prefs-projector__input font-maru-mono"
        type="text"
        autocomplete="off"
        spellcheck="false"
        :disabled="disabled"
        placeholder="Confidential server client only"
      >
    </div>

    <div class="prefs-projector__field">
      <div class="prefs-projector__label-row">
        <label
          class="prefs-projector__label"
          :for="spotifyId"
        >Spotify client ID</label>
        <MaruTooltip
          placement="bottom"
          text="Client ID from your Spotify developer app. Required to import Spotify playlists."
        >
          <button
            type="button"
            class="prefs-projector__help"
            aria-label="About Spotify client ID"
            :disabled="disabled"
          >?</button>
        </MaruTooltip>
      </div>
      <input
        :id="spotifyId"
        v-model="spotifyClientId"
        class="prefs-projector__input font-maru-mono"
        type="text"
        autocomplete="off"
        spellcheck="false"
        :disabled="disabled"
        placeholder="Spotify developer app client ID"
      >
      <p class="prefs-projector__hint">
        Create an app at
        <a
          class="prefs-projector__hint-link"
          :href="SPOTIFY_DASHBOARD_URL"
          target="_blank"
          rel="noopener noreferrer"
        >developer.spotify.com/dashboard</a>. The client secret is required for the OAuth token exchange.
      </p>
    </div>

    <div class="prefs-projector__field">
      <div class="prefs-projector__label-row">
        <label
          class="prefs-projector__label"
          :for="spotifySecretId"
        >Spotify client secret</label>
        <MaruTooltip
          placement="bottom"
          text="Required for Spotify token exchange. Never share it — this file is stored in plaintext like .env."
        >
          <button
            type="button"
            class="prefs-projector__help"
            aria-label="About Spotify client secret"
            :disabled="disabled"
          >?</button>
        </MaruTooltip>
      </div>
      <input
        :id="spotifySecretId"
        v-model="spotifyClientSecret"
        class="prefs-projector__input font-maru-mono"
        type="text"
        autocomplete="off"
        spellcheck="false"
        :disabled="disabled"
        placeholder="Spotify developer app client secret"
      >
    </div>

    <div class="prefs-projector__field">
      <div class="prefs-projector__label-row">
        <label
          class="prefs-projector__label"
          :for="redirectId"
        >Spotify redirect URI (optional)</label>
        <MaruTooltip
          placement="bottom"
          text="Override for the Spotify OAuth callback. Leave empty to auto-derive from the address you open Louis at."
        >
          <button
            type="button"
            class="prefs-projector__help"
            aria-label="About Spotify redirect URI"
            :disabled="disabled"
          >?</button>
        </MaruTooltip>
      </div>
      <input
        :id="redirectId"
        v-model="spotifyRedirectUri"
        class="prefs-projector__input font-maru-mono"
        type="text"
        autocomplete="off"
        spellcheck="false"
        :disabled="disabled"
        placeholder="https://…/api/spotify/auth/callback"
      >
      <p class="prefs-projector__hint">
        Most Spotify apps reject <span class="font-maru-mono">localhost</span> and only accept HTTPS redirects — see
        <a
          class="prefs-projector__hint-link"
          :href="'https://github.com/ashish161/louis/blob/main/docs/SPOTIFY.md'"
          target="_blank"
          rel="noopener noreferrer"
        >docs/SPOTIFY.md</a>.
      </p>
    </div>

    <p
      v-if="activeHint"
      class="prefs-projector__hint"
    >
      {{ activeHint }}
    </p>

    <p
      v-if="restartRequired"
      class="prefs-projector__error"
    >
      Saved — restart the server to apply (e.g. <span class="font-maru-mono">docker compose restart</span>, or restart the add-on).
    </p>

    <p
      v-if="error"
      class="prefs-projector__error"
    >
      {{ error }}
    </p>
  </div>
</template>