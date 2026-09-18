export type ServerSettingsValues = {
  yotoClientId: string
  yotoClientSecret: string
  spotifyClientId: string
  spotifyClientSecret: string
  spotifyRedirectUri: string
}

export type EffectiveServerSettings = {
  yotoClientId: string
  yotoClientSecret: string
  spotifyClientId: string
  spotifyClientSecret: string
  spotifyRedirectUri: string
}

export type ServerSettingsState = {
  saved: ServerSettingsValues
  effective: EffectiveServerSettings
  restartRequired: boolean
}

export function useServerSettings() {
  async function fetchState(): Promise<ServerSettingsState> {
    return await $fetch<ServerSettingsState>('/api/settings')
  }

  async function save(patch: Partial<ServerSettingsValues>): Promise<ServerSettingsState> {
    return await $fetch<ServerSettingsState>('/api/settings', { method: 'PUT', body: patch })
  }

  return { fetchState, save }
}