import { performance } from 'node:perf_hooks'
import type { H3Event } from 'h3'
import {
  REQUEST_CORRELATION_ID_KEY,
  getRequestCorrelationId,
} from '../utils/request-context'

const REQUEST_START_KEY = 'request:log:start'

/**
 * Request-logging plugin: logs every handled request with a correlation id,
 * method, path, status code and duration
 * (e.g. `[req_1a2b3c4d] [http] GET /api/spotify/resolve -> 200 (81340ms)`).
 */
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('request', (event) => {
    event.context[REQUEST_START_KEY] = performance.now()
    getRequestCorrelationId(event)
  })

  nitroApp.hooks.hook('afterResponse', (event) => {
    if (!shouldLogRequest(event)) return
    const start = event.context[REQUEST_START_KEY]
    const duration = typeof start === 'number'
      ? Math.round(performance.now() - start)
      : undefined
    const status = event.node.res.statusCode || 200
    const ms = duration !== undefined ? ` (${duration}ms)` : ''
    const log = status >= 500 ? console.error : status >= 400 ? console.warn : console.info
    const id = event.context[REQUEST_CORRELATION_ID_KEY]
    log(`[${id}] [http] ${event.method ?? 'GET'} ${event.path} -> ${status}${ms}`)
  })
})

function shouldLogRequest(event: H3Event): boolean {
  const path = event.path || ''
  // Asset/health chatter is noise; log actual API + page traffic.
  return !path.startsWith('/_nuxt/') && path !== '/favicon.ico'
}