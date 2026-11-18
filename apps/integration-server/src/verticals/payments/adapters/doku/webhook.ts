/**
 * DOKU signs its HTTP notifications with the same HMAC-SHA256 scheme used for
 * outbound API requests. When a notification hits the merchant's notification
 * URL, DOKU sends `Client-Id`, `Request-Id`, `Request-Timestamp`, and a
 * `Signature` header of the form `HMACSHA256=<base64>`.
 *
 * The merchant re-derives the signature from the request components:
 *   Client-Id:<client id>
 *   Request-Id:<request id>
 *   Request-Timestamp:<request timestamp>
 *   Request-Target:<notification path>
 *   Digest:<base64(sha256(raw body))>
 * keyed with the merchant secret key, then compares it to the received header.
 *
 * Docs: https://jokul.doku.com/docs/docs/technical-references/generate-signature/
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

/** Default notification request-target. DOKU includes it in the signature; the
 *  merchant must use the path its notification URL is registered under. The
 *  resolved value can be supplied via the `x-request-target` header (lower- or
 *  mixed-case) when it differs from this default. */
const DEFAULT_REQUEST_TARGET = '/doku-notification'

function header(headers: Record<string, string>, name: string): string | undefined {
  const lower = name.toLowerCase()
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === lower) return v
  }
  return undefined
}

export function verifyDokuWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const received = header(headers, 'signature')
    if (!received) return false
    const clientId = header(headers, 'client-id') ?? ''
    const requestId = header(headers, 'request-id') ?? ''
    const requestTimestamp = header(headers, 'request-timestamp') ?? ''
    const requestTarget = header(headers, 'request-target') ?? DEFAULT_REQUEST_TARGET

    const digest = createHash('sha256').update(payload).digest('base64')
    const stringToSign = [
      `Client-Id:${clientId}`,
      `Request-Id:${requestId}`,
      `Request-Timestamp:${requestTimestamp}`,
      `Request-Target:${requestTarget}`,
      `Digest:${digest}`,
    ].join('\n')
    const expected = `HMACSHA256=${createHmac('sha256', secret).update(stringToSign, 'utf8').digest('base64')}`

    const a = Buffer.from(received)
    const b = Buffer.from(expected)
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

const STATUS_ACTION: Record<string, WebhookAction> = {
  SUCCESS: 'succeeded',
  SETTLEMENT: 'succeeded',
  PENDING: 'created',
  ORDER_GENERATED: 'created',
  FAILED: 'failed',
  EXPIRED: 'failed',
  REFUNDED: 'refunded',
  VOID: 'cancelled',
  CANCELLED: 'cancelled',
  CANCELED: 'cancelled',
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
}

export function parseDokuWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const order = asRecord(payload['order'])
  const transaction = asRecord(payload['transaction'])
  const refund = asRecord(payload['refund'])

  const isRefund = Object.keys(refund).length > 0
  const resourceType: WebhookResourceType = isRefund ? 'refunds' : 'charges'

  const status = String(transaction['status'] ?? refund['status'] ?? '').toUpperCase()
  const action: WebhookAction = STATUS_ACTION[status] ?? 'unknown'

  const resourceId = String(order['invoice_number'] ?? transaction['original_request_id'] ?? '')
  const type = `${isRefund ? 'refund' : 'transaction'}.${status.toLowerCase() || 'unknown'}`

  return [
    {
      platform: 'doku',
      type,
      resourceType,
      action,
      resourceId,
      payload,
    },
  ]
}

export const DokuWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyDokuWebhook,
  parseWebhookEvents: parseDokuWebhookEvents,
}
