/**
 * Vipps MobilePay webhooks (Webhooks API + ePayment events).
 *
 * Vipps signs callbacks with an Azure-API-Management-style HMAC-SHA256 scheme,
 * keyed by the unique secret returned when the webhook was registered. The
 * delivery carries four headers used for verification:
 *
 *   host                     the request host
 *   x-ms-date                RFC-1123 date of the request
 *   x-ms-content-sha256      base64( SHA256(rawBody) )
 *   authorization            HMAC-SHA256 SignedHeaders=...&Signature=<base64>
 *
 * Verification:
 *   1. contentHash = base64(SHA256(rawBody)) must equal the
 *      `x-ms-content-sha256` header.
 *   2. stringToSign = "POST" + "\n" + <pathAndQuery> + "\n" +
 *      <x-ms-date> + ";" + <host> + ";" + <contentHash>
 *   3. signature = base64( HMAC-SHA256(secret, stringToSign) ), compared
 *      constant-time against the `Signature=` part of the authorization header.
 *
 * Because the string-to-sign needs the request method + path, those are passed
 * through `headers` as the synthetic `x-vipps-method` / `x-vipps-path` keys by
 * the webhook router (defaulting to `POST` / `/` when absent).
 *
 * ePayment event payloads carry: msn, reference, pspReference, name
 * (CREATED|AUTHORIZED|CAPTURED|CANCELLED|REFUNDED|ABORTED|EXPIRED|TERMINATED),
 * amount {value, currency}, timestamp, idempotencyKey, success.
 *
 * Docs:
 *   https://developer.vippsmobilepay.com/docs/APIs/webhooks-api/request-authentication/
 *   https://developer.vippsmobilepay.com/docs/APIs/epayment-api/api-guide/webhooks/
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

/**
 * The ePayment `name` field (or the trailing segment of the webhook event
 * type, e.g. `epayments.payment.captured.v1`) onto the canonical
 * `{ resourceType, action }`. Refunds map to `refunds`; everything else is a
 * `charges` lifecycle transition.
 */
const EVENT_MAP: Record<string, { resourceType: WebhookResourceType; action: WebhookAction }> = {
  created: { resourceType: 'charges', action: 'created' },
  authorized: { resourceType: 'charges', action: 'succeeded' },
  captured: { resourceType: 'charges', action: 'paid' },
  cancelled: { resourceType: 'charges', action: 'cancelled' },
  refunded: { resourceType: 'refunds', action: 'refunded' },
  aborted: { resourceType: 'charges', action: 'cancelled' },
  expired: { resourceType: 'charges', action: 'failed' },
  terminated: { resourceType: 'charges', action: 'cancelled' },
}

/**
 * Reduce a Vipps event identifier to its lifecycle keyword. Accepts both the
 * short `name` (`CAPTURED`) and the dotted event type
 * (`epayments.payment.captured.v1`).
 */
function lifecycleKeyword(input: string): string {
  const lowered = input.toLowerCase()
  if (!lowered.includes('.')) return lowered
  const parts = lowered.split('.').filter((p) => p && p !== 'v1' && p !== 'v2')
  return parts[parts.length - 1] ?? ''
}

function classify(input: string): { resourceType: WebhookResourceType; action: WebhookAction } {
  return EVENT_MAP[lifecycleKeyword(input)] ?? { resourceType: 'unknown', action: 'unknown' }
}

function parseAuthorization(header: string): { signedHeaders?: string; signature?: string } {
  // "HMAC-SHA256 SignedHeaders=x-ms-date;host;x-ms-content-sha256&Signature=<b64>"
  const out: { signedHeaders?: string; signature?: string } = {}
  const space = header.indexOf(' ')
  const params = space >= 0 ? header.slice(space + 1) : header
  for (const part of params.split('&')) {
    const eq = part.indexOf('=')
    if (eq < 0) continue
    const key = part.slice(0, eq).trim().toLowerCase()
    const value = part.slice(eq + 1).trim()
    if (key === 'signedheaders') out.signedHeaders = value
    else if (key === 'signature') out.signature = value
  }
  return out
}

function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

export function verifyVippsMobilepayWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    if (!secret) return false
    const h = (name: string): string | undefined => headers[name] ?? headers[name.toLowerCase()]

    const authorization = h('authorization')
    const date = h('x-ms-date')
    const host = h('host')
    const contentHashHeader = h('x-ms-content-sha256')
    if (!authorization || !date || !host || !contentHashHeader) return false

    // 1. The advertised content hash must match the actual body.
    const contentHash = createHash('sha256').update(payload).digest('base64')
    if (!constantTimeEquals(contentHash, contentHashHeader)) return false

    const { signature } = parseAuthorization(authorization)
    if (!signature) return false

    // 2. Rebuild the string-to-sign. Method + path are surfaced by the router
    //    on synthetic headers; default to POST / "/" when absent.
    const method = (h('x-vipps-method') ?? 'POST').toUpperCase()
    const pathAndQuery = h('x-vipps-path') ?? '/'
    const stringToSign = `${method}\n${pathAndQuery}\n${date};${host};${contentHash}`

    // 3. Sign and compare constant-time.
    const expected = createHmac('sha256', secret).update(stringToSign, 'utf8').digest('base64')
    return constantTimeEquals(expected, signature)
  } catch {
    return false
  }
}

export function parseVippsMobilepayWebhookEvents(
  payload: Record<string, unknown>,
): WebhookEvent[] {
  // `name` is the ePayment event keyword (CAPTURED, REFUNDED, …); fall back to
  // a dotted `eventType`/`event` field if a future delivery shape uses one.
  const name = String(payload['name'] ?? payload['eventType'] ?? payload['event'] ?? '')
  const reference = String(payload['reference'] ?? '')
  const pspReference = payload['pspReference'] != null ? String(payload['pspReference']) : undefined
  const { resourceType, action } = classify(name)
  return [
    {
      id: pspReference,
      platform: 'vipps-mobilepay',
      type: name,
      resourceType,
      action,
      resourceId: reference || (pspReference ?? ''),
      payload,
    },
  ]
}

export const VippsMobilepayWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyVippsMobilepayWebhook,
  parseWebhookEvents: parseVippsMobilepayWebhookEvents,
}
