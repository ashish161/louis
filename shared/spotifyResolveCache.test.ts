import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  cacheKeysForSongs,
  importItemFromCached,
  isPositionalResolveKey,
  materializeCachedItems,
  positionalReuseConflict,
  songResolveKey,
  splitReusableKeys,
  type CachedSpotResolveItem,
  type SpotifyResolveCacheEntry,
} from '../shared/spotifyResolveCache.ts'
import type { SpotdlSong } from '../shared/spotdlMap.ts'

const song: SpotdlSong = {
  name: 'abc',
  artists: ['Kids'],
  duration: 100,
  url: 'https://open.spotify.com/track/AAAA1111BBBB2222CCCC',
  song_id: 'AAAA1111BBBB2222CCCC',
  list_position: 1,
  download_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
}

function cached(key: string, overrides: Partial<CachedSpotResolveItem> = {}): CachedSpotResolveItem {
  return {
    playlistItemId: `id:${key}`,
    videoId: 'dQw4w9WgXcQ',
    position: 1,
    title: 'abc',
    channelTitle: 'Kids',
    duration: '1:40',
    durationSeconds: 100,
    available: true,
    matchedBy: 'spotdl',
    ...overrides,
  }
}

function entry(perSong: Record<string, CachedSpotResolveItem> = {}): SpotifyResolveCacheEntry {
  return {
    version: 1,
    kind: 'playlist',
    id: 'pl',
    snapshotId: 'AAA',
    keys: Object.keys(perSong),
    perSong,
    updatedAt: 1,
  }
}

describe('songResolveKey / cacheKeysForSongs', () => {
  it('uses the spotify song_id when present', () => {
    assert.equal(songResolveKey(song, 0), 'AAAA1111BBBB2222CCCC')
    assert.equal(isPositionalResolveKey('AAAA1111BBBB2222CCCC'), false)
  })

  it('falls back to a positional key using list_position then index', () => {
    assert.equal(songResolveKey({ name: 'x' }, 3), 'pos:4')
    assert.equal(songResolveKey({ name: 'x', list_position: 2 }, 3), 'pos:2')
    assert.equal(isPositionalResolveKey('pos:2'), true)
  })

  it('builds position-ordered keys across a mixed dump', () => {
    const keys = cacheKeysForSongs([
      song,
      { name: 'local-file-only' },
      song,
    ])
    assert.deepEqual(keys, ['AAAA1111BBBB2222CCCC', 'pos:2', 'AAAA1111BBBB2222CCCC'])
  })
})

describe('splitReusableKeys', () => {
  it('returns everything missing when there is no cache', () => {
    const { reusable, missing } = splitReusableKeys(null, [song])
    assert.deepEqual(reusable, [])
    assert.deepEqual(missing, ['AAAA1111BBBB2222CCCC'])
  })

  it('reuses song_id keys straight from the cache', () => {
    const { reusable, missing } = splitReusableKeys(entry({ AAAA1111BBBB2222CCCC: cached('AAAA1111BBBB2222CCCC') }), [song])
    assert.deepEqual(reusable, ['AAAA1111BBBB2222CCCC'])
    assert.deepEqual(missing, [])
  })

  it('treats unknown keys as missing', () => {
    const { reusable, missing } = splitReusableKeys(entry({}), [song])
    assert.deepEqual(reusable, [])
    assert.deepEqual(missing, ['AAAA1111BBBB2222CCCC'])
  })

  it('re-verifies positional keys against the current dump', () => {
    const { reusable, missing } = splitReusableKeys(
      entry({ 'pos:1': cached('pos:1', { title: 'a DIFFERENT track' }) }),
      [song],
    )
    assert.deepEqual(reusable, [])
    assert.deepEqual(missing, ['AAAA1111BBBB2222CCCC'])
  })
})

describe('positionalReuseConflict', () => {
  it('flags title drift', () => {
    assert.equal(positionalReuseConflict(cached('pos:1', { title: 'old title' }), song), true)
    assert.equal(positionalReuseConflict(cached('pos:1', { title: 'abc' }), song), false)
  })

  it('flags artist drift', () => {
    assert.equal(
      positionalReuseConflict(cached('pos:1', { channelTitle: 'Someone Else' }), song),
      true,
    )
  })

  it('flags duration drift beyond 2s', () => {
    assert.equal(
      positionalReuseConflict(cached('pos:1', { durationSeconds: 999 }), song),
      true,
    )
    assert.equal(
      positionalReuseConflict(cached('pos:1', { durationSeconds: 101 }), song),
      false,
    )
  })

  it('ignores songs the dump cannot name', () => {
    assert.equal(positionalReuseConflict(cached('pos:1'), null), false)
    assert.equal(positionalReuseConflict(cached('pos:1'), { name: 'Unknown track' }), false)
  })
})

describe('materializeCachedItems / importItemFromCached', () => {
  it('rederives positions from the live order', () => {
    const e = entry({
      'AAAA1111BBBB2222CCCC': cached('AAAA1111BBBB2222CCCC', { position: 12 }),
      'pos:2': cached('pos:2', { position: 12, title: 'second' }),
    })
    const items = materializeCachedItems(e)
    assert.equal(items.length, 2)
    assert.equal(items[0]?.position, 1)
    assert.equal(items[1]?.position, 2)
    assert.equal(items[0]?.videoId, 'dQw4w9WgXcQ')
  })

  it('emits duplicate keys once per slot (same track twice)', () => {
    const e = entry({
      AAAA1111BBBB2222CCCC: cached('AAAA1111BBBB2222CCCC'),
    })
    e.keys = ['AAAA1111BBBB2222CCCC', 'AAAA1111BBBB2222CCCC']
    const items = materializeCachedItems(e)
    assert.equal(items.length, 2)
    assert.equal(items[0]?.position, 1)
    assert.equal(items[1]?.position, 2)
  })

  it('skips slots without a mapping', () => {
    const e = entry({})
    e.keys = ['missing-key']
    assert.equal(materializeCachedItems(e).length, 0)
  })

  it('importItemFromCached carries the expected fields', () => {
    const item = importItemFromCached(cached('k', {
      thumbnailUrl: 'https://example.com/t.jpg',
      duration: '1:40',
      durationSeconds: 100,
    }), 0)
    assert.deepEqual(item, {
      playlistItemId: 'id:k',
      videoId: 'dQw4w9WgXcQ',
      position: 1,
      title: 'abc',
      channelTitle: 'Kids',
      thumbnailUrl: 'https://example.com/t.jpg',
      duration: '1:40',
      durationSeconds: 100,
      available: true,
    })
  })
})