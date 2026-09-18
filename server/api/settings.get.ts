import { readServerSettingsState } from '../utils/server-settings'

export default defineEventHandler(async (event) => {
  return await readServerSettingsState(event)
})