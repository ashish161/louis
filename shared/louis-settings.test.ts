import { test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import {
  SERVER_SETTINGS_FILE_NAME,
  SERVER_SETTINGS_ENV_FIELDS,
  applyServerSettingsToEnv,
  mergeServerSettings,
  normalizeServerSettings,
  serverSettingsFilePath,
  serverSettingsNeedsSetup,
} from './louis-settings.mjs'

test('serverSettingsFilePath uses work dir when set', () => {
  assert.equal(
    serverSettingsFilePath('/data/audio', '/tmp'),
    join('/data/audio', SERVER_SETTINGS_FILE_NAME),
  )
})

test('serverSettingsFilePath falls back to tmp yoto-cards-audio', () => {
  assert.equal(
    serverSettingsFilePath('', '/var/folders/x'),
    join('/var/folders/x', 'yoto-cards-audio', SERVER_SETTINGS_FILE_NAME),
  )
})

test('normalizeServerSettings trims and tolerates junk', () => {
  assert.deepEqual(normalizeServerSettings({
    yotoClientId: '  abc  ',
    yotoClientSecret: 'secret',
    spotifyClientId: null,
    spotifyClientSecret: 123,
    spotifyRedirectUri: '  https://x/cb  ',
  }), {
    yotoClientId: 'abc',
    yotoClientSecret: 'secret',
    spotifyClientId: '',
    spotifyClientSecret: '',
    spotifyRedirectUri: 'https://x/cb',
  })
  assert.deepEqual(normalizeServerSettings(undefined), {
    yotoClientId: '',
    yotoClientSecret: '',
    spotifyClientId: '',
    spotifyClientSecret: '',
    spotifyRedirectUri: '',
  })
})

test('serverSettingsNeedsSetup true without yoto client id', () => {
  assert.equal(serverSettingsNeedsSetup(normalizeServerSettings({})), true)
  assert.equal(serverSettingsNeedsSetup({ yotoClientId: 'abc' }), false)
})

test('mergeServerSettings overlays without dropping keys', () => {
  const current = normalizeServerSettings({ yotoClientId: 'a', spotifyClientId: 'b' })
  const merged = mergeServerSettings(current, { spotifyClientId: 'c' })
  assert.equal(merged.yotoClientId, 'a')
  assert.equal(merged.spotifyClientId, 'c')
})

test('applyServerSettingsToEnv writes LOUIS_* + NUXT_* only for non-empty fields', () => {
  const env = {}
  applyServerSettingsToEnv(env, normalizeServerSettings({
    yotoClientId: 'abc',
    spotifyClientId: '',
  }))
  assert.equal(env.LOUIS_YOTO_CLIENT_ID, 'abc')
  assert.equal(env.NUXT_YOTO_CLIENT_ID, 'abc')
  assert.equal(env.SPOTIFY_CLIENT_ID, undefined)
  assert.equal(SERVER_SETTINGS_ENV_FIELDS.length, 5)
})