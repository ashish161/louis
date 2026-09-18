import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  normalizeSpotifyLoopbackOrigin,
  resolveSpotifyRedirectUri,
} from './spotifyRedirect.ts'

describe('normalizeSpotifyLoopbackOrigin', () => {
  it('maps localhost to 127.0.0.1 with port', () => {
    assert.equal(
      normalizeSpotifyLoopbackOrigin('http://localhost:4000'),
      'http://127.0.0.1:4000',
    )
  })

  it('leaves 127.0.0.1 unchanged', () => {
    assert.equal(
      normalizeSpotifyLoopbackOrigin('http://127.0.0.1:4010'),
      'http://127.0.0.1:4010',
    )
  })

  it('maps localhost to 127.0.0.1 but keeps https', () => {
    assert.equal(
      normalizeSpotifyLoopbackOrigin('https://localhost:4000'),
      'https://127.0.0.1:4000',
    )
  })

  it('leaves LAN http origins unchanged', () => {
    assert.equal(
      normalizeSpotifyLoopbackOrigin('http://192.168.1.10:4000'),
      'http://192.168.1.10:4000',
    )
  })
})

describe('resolveSpotifyRedirectUri', () => {
  it('uses pinned redirect when set', () => {
    assert.equal(
      resolveSpotifyRedirectUri('http://localhost:4000', 'http://127.0.0.1:4010/api/spotify/auth/callback'),
      'http://127.0.0.1:4010/api/spotify/auth/callback',
    )
  })

  it('builds callback from normalized loopback origin', () => {
    assert.equal(
      resolveSpotifyRedirectUri('http://localhost:4000'),
      'http://127.0.0.1:4000/api/spotify/auth/callback',
    )
  })
})
