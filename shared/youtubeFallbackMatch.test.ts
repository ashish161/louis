import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  bestYoutubeFallbackMatch,
  scoreYoutubeFallbackMatch,
  formatSeconds,
  type YoutubeFallbackSearchResult,
} from './youtubeFallbackMatch.ts'

const result = (id: string, title: string, channelTitle: string, durationSeconds?: number): YoutubeFallbackSearchResult =>
  ({ id, title, channelTitle, durationSeconds })

test('formatSeconds renders mm:ss and rolls over 60s', () => {
  assert.equal(formatSeconds(0), '0:00')
  assert.equal(formatSeconds(59), '0:59')
  assert.equal(formatSeconds(60), '1:00')
  assert.equal(formatSeconds(1377), '22:57')
  assert.equal(formatSeconds(2489), '41:29')
})

test('exact-title match scores highest for a nursery song found only off YTM', () => {
  const track = { title: 'Three Little Fishies', artist: 'Sugar Kane Music', durationSec: 90 }
  const results = [
    result('TiC4RoBgk70', 'Three Jelly Fish', 'Nursery Rhymes', 87),
    result('541HKD8alfg', 'THREE LITTLE FISHIES ~ The Smoothies  (1939)', 'oldtime radio', 206),
    result('Oyf2TXlJFvY', 'Three Little Fishies | Three Little Fishies Song', 'kids', 175),
    result('RJqimlFcJsM', 'Baddiel & Skinner & Lightning Seeds - Three Lions', 'Football anthems', 236),
  ]
  const best = bestYoutubeFallbackMatch(track, results)
  assert.ok(best)
  assert.equal(best.id, 'Oyf2TXlJFvY')
  assert.ok(scoreYoutubeFallbackMatch(track, results[1]) > 0)
  assert.equal(scoreYoutubeFallbackMatch(track, results[3]), 0)
})

test('long Blippi compilation is accepted but the short singing-walrus clip wins', () => {
  const track = { title: "Days of the Week", artist: 'Kids Imagine Nation', durationSec: 149 }
  const results = [
    result('mXMofxtDPUQ', 'Days of the Week Song | The Singing Walrus', 'The Singing Walrus', 149),
    result('loINl3Ln6Ck', 'Days Of The Week Song | Kids Songs | Super Simple Songs', 'Super Simple Songs - Kids Songs', 86),
    result('F-8KYJpBZTg', 'Days of the Week | Nursery Rhymes and Kids Songs', 'Bounce Patrol', 236),
  ]
  const best = bestYoutubeFallbackMatch(track, results)
  assert.ok(best)
  assert.equal(best.id, 'mXMofxtDPUQ')
})

test("ABC's maps to a Blippi alphabet video when no literal 'ABC' title exists", () => {
  const track = { title: "Blippi - ABC's", artist: 'Blippi, Nicky Notes', durationSec: 90 }
  const results = [
    result('PVFm-1BNYI4', 'Alphabet Song | Blippi Songs | Educational Songs For Kids', 'Moonbug Entertainment', 151),
    result('aC9IcXIkTRI', 'Blippi Learns The Alphabet | Learning ABCs | Blippi Learning Videos', 'Blippi', 3158),
    result('67JzSRnyXr4', 'Learn The Alphabet With Blippi | ABC Letter Boxes', 'Blippi', 2489),
  ]
  // artist bonus rescues a Blippi result even without the literal ABC token
  assert.ok(scoreYoutubeFallbackMatch(track, results[2]) > 0)
  const best = bestYoutubeFallbackMatch(track, results)
  assert.ok(best)
  assert.equal(best.id, 'PVFm-1BNYI4')
})

test('wildly different duration with low overlap is rejected', () => {
  const track = { title: 'Baa Baa Black Sheep - Live Cast Version', artist: 'Blippi', durationSec: 523 }
  assert.equal(
    scoreYoutubeFallbackMatch(track, result('jkBf7XMpDX8', 'Baa Baa Black Sheep 2 Hour Nonstop Lullaby | BLIPPI', 'Blippi', 7307)),
    0,
  )
})

test('unrelated top result from a poor query scores zero', () => {
  const track = { title: 'Three Little Fishies', artist: 'Sugar Kane Music', durationSec: 90 }
  assert.equal(
    scoreYoutubeFallbackMatch(track, result('mJXDHkTXEc4', 'Sugar Cane Instrumental', 'Lo-Fi Beats', 148)),
    0,
  )
})