/**
 * Airwallex webhook verification + event parsing.
 *
 * Airwallex signs each delivery with an HMAC-SHA256 over the concatenation of
 * the `x-timestamp` header value and the **raw** request body, keyed by the
 * webhook endpoint's secret. The hex digest ships in the `x-signature` header:
 *
 *   value_to_digest = `${x-timestamp}${rawBody}`
 *   x-signature     = HMAC_SHA256(secret, value_to_digest).hex()
 *
 * Always verify against the raw bytes — a parsed-and-reserialised body changes
 * whitespace/key-order and breaks the signature.
 *
 * Events are named in dot notation: `payment_intent.succeeded`,
 * `refund.settled`, `customer.created`, etc. The payload envelope is
 * `{ id, name, account_id, created_at, data: { object } }`.
 *
 * Docs: https://www.airwallex.com/docs/developer-tools/webhooks/listen-for-webhook-events
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

/** Reject deliveries whose timestamp is older/newer than this margin. */
const TOLERANCE_SECONDS = 5 * 60

const RESOURCE_MAP: Record<string, WebhookResourceType> = {
  payment_intent: 'charges',
  payment_attempt: 'charges',
  refund: 'refunds',
  customer: 'customers',
  payment_consent: 'payment_methods',
  payment_method: 'payment_methods',
  dispute: 'disputes',
}

const ACTION_MAP: Record<string, WebhookAction> = {
  created: 'created',
  updated: 'updated',
  deleted: 'deleted',
  succeeded: 'succeeded',
  failed: 'failed',
  cancelled: 'cancelled',
  canceled: 'cancelled',
  expired: 'cancelled',
  authorized: 'updated',
  capture_requested: 'updated',
  requires_capture: 'updated',
  received: 'created',
  accepted: 'created',
  processing: 'created',
  pending: 'created',
  settled: 'succeeded',
  paid: 'paid',
  refunded: 'refunded',
  disputed: 'disputed',
}

/**
 * Airwallex event names are dot-delimited with a multi-word resource head, e.g.
 * `payment_intent.succeeded`, `payment_attempt.capture_requested`,
 * `refund.settled`. We take everything before the last dot as the resource and
 * the final segment as the verb.
 */
function classify(eventName: string): {
  resourceType: WebhookResourceType
  action: WebhookAction
} {
  const lowered = eventName.toLowerCase()
  const dot = lowered.lastIndexOf('.')
  if (dot === -1) return { resourceType: 'unknown', action: 'unknown' }
  const head = lowered.slice(0, dot)
  const verb = lowered.slice(dot + 1)
  return {
    resourceType: RESOURCE_MAP[head] ?? 'unknown',
    action: ACTION_MAP[verb] ?? 'unknown',
  }
}

export function verifyAirwallexWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const sig = headers['x-signature'] ?? headers['X-Signature']
    const timestamp = headers['x-timestamp'] ?? headers['X-Timestamp']
    if (!sig || !timestamp || !secret) return false

    const ts = parseInt(String(timestamp), 10)
    if (Number.isFinite(ts)) {
      const now = Math.floor(Date.now() / 1000)
      if (Math.abs(now - ts) > TOLERANCE_SECONDS) return false
    }

    const valueToDigest = `${timestamp}${payload.toString('utf8')}`
    const expected = createHmac('sha256', secret).update(valueToDigest).digest('hex')
    const a = Buffer.from(sig, 'hex')
    const b = Buffer.from(expected, 'hex')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export function parseAirwallexWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const name = String(payload['name'] ?? '')
  const id = payload['id'] != null ? String(payload['id']) : undefined
  const data = (payload['data'] as Record<string, unknown> | undefined) ?? {}
  const object = (data['object'] as Record<string, unknown> | undefined) ?? {}
  const resourceId = String(
    object['id'] ?? object['payment_intent_id'] ?? data['id'] ?? '',
  )
  const { resourceType, action } = classify(name)
  return [
    {
      id,
      platform: 'airwallex',
      type: name,
      resourceType,
      action,
      resourceId,
      payload,
    },
  ]
}

export const AirwallexWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyAirwallexWebhook,
  parseWebhookEvents: parseAirwallexWebhookEvents,
}
