import { randomUUID } from 'node:crypto'
import type { H3Event } from 'h3'

export const REQUEST_CORRELATION_ID_KEY = 'request:correlationId'

/** Short random correlation id (e.g. `req_1a2b3c4d`) for one request. */
export function newRequestCorrelationId(): string {
  return `req_${randomUUID().replace(/-/g, '').slice(0, 10)}`
}

/** Correlation id for the given request event (generates one if absent). */
export function getRequestCorrelationId(event: H3Event): string {
  const existing = event.context[REQUEST_CORRELATION_ID_KEY]
  if (typeof existing === 'string' && existing) return existing
  const id = newRequestCorrelationId()
  event.context[REQUEST_CORRELATION_ID_KEY] = id
  return id
}

/** Prefix a log message with a correlation id when one is attached. */
export function withRequestCtx(event: H3Event, message: string): string {
  return `[${getRequestCorrelationId(event)}] ${message}`
}