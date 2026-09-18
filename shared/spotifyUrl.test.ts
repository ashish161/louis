import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  isSpotifyId,
  parseSpotifyPlaylistUrl,
  parseSpotifyResource,
  spotifyOpenUrl,
} from './spotifyUrl.ts'

describe('parseSpotifyResource', () => {
  it('parses open.spotify.com playlist URLs', () => {
    const parsed = parseSpotifyResource(
      'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=abc',
    )
    assert.deepEqual(parsed, {
      kind: 'playlist',
      id: '37i9dQZF1DXcBWIGoYBM5M',
      url: 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M',
    })
  })

  it('parses intl and embed-style paths', () => {
    const parsed = parseSpotifyResource(
      'https://open.spotify.com/intl-en/album/4yP0hdKOZPNshxUOjY0cZj',
    )
    assert.equal(parsed?.kind, 'album')
    assert.equal(parsed?.id, '4yP0hdKOZPNshxUOjY0cZj')
  })

  it('parses spotify: URIs', () => {
    const parsed = parseSpotifyResource('spotify:track:0VjIjW4GlUZAMYd2vXMi3b')
    assert.deepEqual(parsed, {
      kind: 'track',
      id: '0VjIjW4GlUZAMYd2vXMi3b',
      url: 'https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b',
    })
  })

  it('rejects non-spotify hosts', () => {
    assert.equal(parseSpotifyResource('https://example.com/playlist/abc'), null)
  })
})

describe('parseSpotifyPlaylistUrl', () => {
  it('returns playlist ids only', () => {
    assert.equal(
      parseSpotifyPlaylistUrl('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M'),
      '37i9dQZF1DXcBWIGoYBM5M',
    )
    assert.equal(
      parseSpotifyPlaylistUrl('https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b'),
      null,
    )
  })
})

describe('helpers', () => {
  it('validates ids and builds open urls', () => {
    assert.equal(isSpotifyId('37i9dQZF1DXcBWIGoYBM5M'), true)
    assert.equal(isSpotifyId('short'), false)
    assert.equal(
      spotifyOpenUrl('playlist', '37i9dQZF1DXcBWIGoYBM5M'),
      'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M',
    )
  })
})
