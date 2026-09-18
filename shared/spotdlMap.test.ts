import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { mapSpotdlSongsToImportItems } from '../shared/spotdlMap.ts'

describe('mapSpotdlSongsToImportItems', () => {
  it('maps matched songs to import items and counts unmatched', () => {
    const { items, unmatched } = mapSpotdlSongsToImportItems([
      {
        name: 'Blinding Lights',
        artists: ['The Weeknd'],
        duration: 200.4,
        url: 'https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b',
        song_id: '0VjIjW4GlUZAMYd2vXMi3b',
        cover_url: 'https://example.com/cover.jpg',
        download_url: 'https://www.youtube.com/watch?v=4NRXx6U8ABQ',
        list_position: 1,
      },
      {
        name: 'Missing Match',
        artist: 'Nobody',
        download_url: null,
      },
    ])

    assert.equal(unmatched, 1)
    assert.equal(items.length, 1)
    assert.equal(items[0]?.videoId, '4NRXx6U8ABQ')
    assert.equal(items[0]?.title, 'Blinding Lights')
    assert.equal(items[0]?.channelTitle, 'The Weeknd')
    assert.equal(items[0]?.durationSeconds, 200)
    assert.equal(items[0]?.available, true)
  })

  it('accepts youtu.be download urls', () => {
    const { items, unmatched } = mapSpotdlSongsToImportItems([
      {
        name: 'Song',
        artist: 'Artist',
        duration: 90,
        download_url: 'https://youtu.be/dQw4w9WgXcQ',
      },
    ])
    assert.equal(unmatched, 0)
    assert.equal(items[0]?.videoId, 'dQw4w9WgXcQ')
  })

  it('skips null entries spotdl sometimes emits', () => {
    const { items, unmatched } = mapSpotdlSongsToImportItems([
      null,
      {
        name: 'Ok',
        artist: 'Artist',
        download_url: 'https://www.youtube.com/watch?v=4NRXx6U8ABQ',
      },
      null,
    ])
    assert.equal(unmatched, 2)
    assert.equal(items.length, 1)
    assert.equal(items[0]?.videoId, '4NRXx6U8ABQ')
  })
})
