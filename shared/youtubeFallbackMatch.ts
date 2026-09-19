export interface YoutubeFallbackTrack {
  title: string
  artist: string
  durationSec?: number
}

export interface YoutubeFallbackSearchResult {
  id: string
  title: string
  channelTitle: string
  durationSeconds?: number
  thumbnailUrl?: string
}

function titleTokens(value: string): string[] {
  return value.toLowerCase()
    .split(/[^a-z0-9]+/)
    .map(t => t.trim())
    .filter(t => t.length > 0 && t !== 'the' && t !== 'a'
      && t !== 'an' && t !== 'and' && t !== 'feat' && t !== 'ft')
}

export function formatSeconds(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  if (s === 60) return `${m + 1}:00`
  return `${m}:${String(s).padStart(2, '0')}`
}

/**
 * SpotDL only searches YouTube Music, which misses kids'/nursery recordings
 * that exist on plain YouTube. Score a plain-YouTube result for an unmatched
 * Spotify track: title-token coverage + exact-subtitle/artist bonuses, softly
 * penalised by duration mismatch (compilations are acceptable for kids' cards,
 * but >2h or wildly off results are rejected).
 */
export function scoreYoutubeFallbackMatch(
  track: YoutubeFallbackTrack,
  result: YoutubeFallbackSearchResult,
): number {
  const songTokens = titleTokens(track.title)
  if (songTokens.length === 0) return 0
  const resultTokens = new Set(titleTokens(result.title))
  const overlap = songTokens.filter(t => resultTokens.has(t)).length / songTokens.length
  if (overlap <= 0) return 0

  const resultLower = result.title.toLowerCase()
  const artists = titleTokens(track.artist)
  const artistFound = artists.length > 0
    && artists.some(a => resultLower.includes(a) || result.channelTitle.toLowerCase().includes(a))
  const exactSubtitle = resultLower.includes(track.title.toLowerCase())

  let score = overlap * 100
  if (exactSubtitle) score += 30
  if (artistFound) score += 15

  const resSec = result.durationSeconds
  if (track.durationSec !== undefined && typeof resSec === 'number' && Number.isFinite(resSec) && resSec > 0) {
    if (resSec > 7200 || resSec / track.durationSec > 40) return 0
    score -= Math.min(80, Math.abs(Math.log2(resSec / track.durationSec)) * 55)
  }
  return Math.max(0, score)
}

export function bestYoutubeFallbackMatch(
  track: YoutubeFallbackTrack,
  results: YoutubeFallbackSearchResult[],
): YoutubeFallbackSearchResult | null {
  let best: YoutubeFallbackSearchResult | null = null
  let bestScore = 0
  for (const result of results) {
    const score = scoreYoutubeFallbackMatch(track, result)
    if (score > bestScore) {
      bestScore = score
      best = result
    }
  }
  return bestScore > 0 ? best : null
}