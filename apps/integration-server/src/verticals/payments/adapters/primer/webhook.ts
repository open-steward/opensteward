/**
 * Primer webhook verification + event parsing.
 *
 * Primer signs each delivery with an HMAC-SHA256 over the **raw** request body,
 * keyed by the endpoint's signing secret, base64-encoded. The signature ships
 * in `X-Signature-Primary`; during a secret rotation a second valid signature
 * (under the previous secret) ships in `X-Signature-Secondary` for 24 hours, so
 * we accept either header.
 *
 *   signature = base64( HMAC_SHA256(secret, rawBody) )
 *
 * Always verify against the raw bytes — a parsed-and-reserialised body changes
 * whitespace/key-order and breaks the signature. The payload carries a
 * `signedAt` Unix timestamp; Primer recommends rejecting deliveries more than
 * 3 minutes from the current time to defend against replay.
 *
 * Events are dot-delimited and uppercase: `PAYMENT.STATUS`, `PAYMENT.REFUND`,
 * `PAYMENT.REFUND.FAILED`, `DISPUTE.OPENED`, … The envelope is
 * `{ eventType, date, version, signedAt, payment | dispute }`.
 *
 * Docs: https://primer.io/docs/api-reference/get-started/configure-webhooks
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

/** Reject deliveries whose `signedAt` is older/newer than this margin. */
const TOLERANCE_SECONDS = 3 * 60

const RESOURCE_MAP: Record<string, WebhookResourceType> = {
  payment: 'charges',
  dispute: 'disputes',
  workflow_run: 'unknown',
}

/**
 * Primer event verbs after the leading resource segment. `PAYMENT.STATUS`
 * carries the payment's own lifecycle status in `payment.status`, so we
 * classify on that when present and fall back to the verb otherwise.
 */
const ACTION_MAP: Record<string, WebhookAction> = {
  status: 'updated',
  refund: 'refunded',
  capture: 'updated',
  cancellation: 'cancelled',
  authorization_adjustment: 'updated',
  opened: 'disputed',
  created: 'created',
  updated: 'updated',
  failed: 'failed',
}

/** Map a Primer payment status onto a canonical webhook action. */
const PAYMENT_STATUS_ACTION: Record<string, WebhookAction> = {
  SETTLED: 'paid',
  PARTIALLY_SETTLED: 'paid',
  SETTLING: 'updated',
  AUTHORIZED: 'updated',
  PENDING: 'created',
  DECLINED: 'failed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
}

/**
 * Primer event types are dot-delimited with the resource as the first segment,
 * e.g. `PAYMENT.STATUS`, `PAYMENT.REFUND.FAILED`, `DISPUTE.OPENED`. The first
 * segment is the resource; the remainder (joined) is the verb.
 */
function classify(
  eventType: string,
  paymentStatus: string | undefined,
): { resourceType: WebhookResourceType; action: WebhookAction } {
  const lowered = eventType.toLowerCase()
  const dot = lowered.indexOf('.')
  if (dot === -1) {
    return { resourceType: RESOURCE_MAP[lowered] ?? 'unknown', action: 'unknown' }
  }
  const head = lowered.slice(0, dot)
  const verb = lowered.slice(dot + 1).replace(/\./g, '_')
  const resourceType = RESOURCE_MAP[head] ?? 'unknown'
  // A PAYMENT.STATUS event carries the real lifecycle state in payment.status.
  if (head === 'payment' && verb === 'status' && paymentStatus) {
    const action = PAYMENT_STATUS_ACTION[paymentStatus.toUpperCase()] ?? 'updated'
    return { resourceType, action }
  }
  // `PAYMENT.REFUND.FAILED` etc. — the trailing `failed` wins over the head verb.
  const leaf = verb.split('_').pop() ?? verb
  const action = ACTION_MAP[leaf] ?? ACTION_MAP[verb] ?? ACTION_MAP[verb.split('_')[0]] ?? 'unknown'
  return { resourceType, action }
}

export function verifyPrimerWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    if (!secret) return false
    const primary = headers['x-signature-primary'] ?? headers['X-Signature-Primary']
    const secondary = headers['x-signature-secondary'] ?? headers['X-Signature-Secondary']
    const candidates = [primary, secondary].filter((s): s is string => Boolean(s))
    if (candidates.length === 0) return false

    // Replay window: the raw body carries `signedAt` (Unix seconds).
    try {
      const parsed = JSON.parse(payload.toString('utf8')) as { signedAt?: unknown }
      const signedAt = Number(parsed?.signedAt)
      if (Number.isFinite(signedAt)) {
        const now = Math.floor(Date.now() / 1000)
        if (Math.abs(now - signedAt) > TOLERANCE_SECONDS) return false
      }
    } catch {
      // Unparseable body — fall through to signature check on the raw bytes.
    }

    const expected = createHmac('sha256', secret).update(payload).digest('base64')
    const expectedBuf = Buffer.from(expected, 'utf8')
    return candidates.some((sig) => {
      const sigBuf = Buffer.from(sig, 'utf8')
      if (sigBuf.length !== expectedBuf.length) return false
      return timingSafeEqual(sigBuf, expectedBuf)
    })
  } catch {
    return false
  }
}

export function parsePrimerWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const eventType = String(payload['eventType'] ?? '')
  const payment = (payload['payment'] as Record<string, unknown> | undefined) ?? undefined
  const dispute = (payload['dispute'] as Record<string, unknown> | undefined) ?? undefined
  const resource = payment ?? dispute ?? {}
  const paymentStatus = payment ? (payment['status'] as string | undefined) : undefined
  const resourceId = String(resource['id'] ?? resource['paymentId'] ?? '')
  const config = payload['notificationConfig'] as Record<string, unknown> | undefined
  const eventId = config?.['id'] != null ? String(config['id']) : undefined
  const { resourceType, action } = classify(eventType, paymentStatus)
  return [
    {
      id: eventId,
      platform: 'primer',
      type: eventType,
      resourceType,
      action,
      resourceId,
      payload,
    },
  ]
}

export const PrimerWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyPrimerWebhook,
  parseWebhookEvents: parsePrimerWebhookEvents,
}
