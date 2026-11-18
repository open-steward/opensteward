/**
 * CellPoint Digital (Velocity) webhooks.
 *
 * Callbacks are delivered as JSON POSTs for every eligible transaction
 * status change. Unlike most gateways the signature is carried IN the body
 * (the `signature` field) rather than a header, and it is a plain SHA-512
 * digest (not HMAC):
 *
 *   1. Remove the `signature` field (and any non-signed extra attributes).
 *   2. Serialise the remainder to a canonical JSON string per RFC 8785
 *      (lexicographically sorted object keys, no insignificant whitespace).
 *   3. Append the merchant salt (shared secret issued by CellPoint).
 *   4. signature = SHA-512_HEX( canonicalJson + salt ).
 *
 * Verification recomputes that digest and compares it to the payload's
 * `signature` in constant time.
 *
 * Webhook status codes (e.g. 2000 = authorized, 4030 = session complete) drive
 * the canonical action mapping.
 *
 * Docs: https://documentation.cellpointdigital.com/docs/webhooks
 *       https://documentation.cellpointdigital.com/docs/webhook-parameters
 */
import { createHash, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'
import { STATUS_CODES } from './constants'

/**
 * RFC 8785 (JCS) canonical JSON serialisation: objects with lexicographically
 * sorted keys, arrays preserved, no insignificant whitespace. Sufficient for
 * the JSON shapes CellPoint emits (objects, arrays, strings, finite numbers,
 * booleans, null).
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'number' || typeof value === 'boolean') {
    return JSON.stringify(value)
  }
  if (typeof value === 'string') return JSON.stringify(value)
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const keys = Object.keys(obj).sort()
    const parts = keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`)
    return `{${parts.join(',')}}`
  }
  // undefined / function / symbol — drop (shouldn't appear in parsed JSON).
  return 'null'
}

/**
 * Verify a CellPoint webhook. The signature lives in the body (`signature`),
 * so we parse the raw buffer, strip the signature field, recompute the
 * SHA-512 digest over the canonical JSON + salt, and compare.
 */
export function verifyCellpointDigitalWebhook(
  payload: Buffer,
  _headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const parsed = JSON.parse(payload.toString('utf8')) as Record<string, unknown>
    const provided = parsed['signature']
    if (typeof provided !== 'string' || provided.length === 0) return false

    const { signature: _omit, ...rest } = parsed
    const expected = createHash('sha512')
      .update(canonicalJson(rest) + secret, 'utf8')
      .digest('hex')

    const a = Buffer.from(provided.toLowerCase(), 'utf8')
    const b = Buffer.from(expected.toLowerCase(), 'utf8')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

/** Map a Velocity webhook status code to a canonical webhook action. */
function mapAction(statusCode: number | undefined): WebhookAction {
  switch (statusCode) {
    case STATUS_CODES.authorized: // 2000
      return 'succeeded'
    case STATUS_CODES.sessionComplete: // 4030
      return 'paid'
    case STATUS_CODES.operationSuccess: // 1000
      return 'succeeded'
    default:
      return 'unknown'
  }
}

/**
 * Parse a verified CellPoint callback into canonical webhook events. A single
 * delivery wraps one session with a `transactions` array; we emit one event
 * per transaction (or a single session-level event when none are present).
 */
export function parseCellpointDigitalWebhookEvents(
  payload: Record<string, unknown>,
): WebhookEvent[] {
  const statusObj = (payload['status'] as Record<string, unknown> | undefined) ?? {}
  const statusCode =
    typeof statusObj['code'] === 'number'
      ? (statusObj['code'] as number)
      : Number(statusObj['code'] ?? NaN)
  const action = mapAction(Number.isNaN(statusCode) ? undefined : statusCode)
  const type = String(statusObj['message'] ?? statusCode ?? 'transaction.updated')
  const sessionId = String(payload['session_id'] ?? '')

  const transactions = Array.isArray(payload['transactions'])
    ? (payload['transactions'] as Array<Record<string, unknown>>)
    : []

  if (transactions.length === 0) {
    return [
      {
        platform: 'cellpoint-digital',
        type,
        resourceType: 'charges',
        action,
        resourceId: sessionId,
        payload,
      },
    ]
  }

  return transactions.map((tx) => ({
    platform: 'cellpoint-digital',
    type,
    resourceType: 'charges' as WebhookResourceType,
    action,
    resourceId: String(tx['id'] ?? tx['order_id'] ?? sessionId),
    payload,
  }))
}

export const CellpointDigitalWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyCellpointDigitalWebhook,
  parseWebhookEvents: parseCellpointDigitalWebhookEvents,
}
