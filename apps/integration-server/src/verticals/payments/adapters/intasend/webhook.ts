/**
 * IntaSend does **not** sign webhooks with an HMAC or asymmetric signature.
 * Instead, when you register a webhook endpoint in the dashboard you provide a
 * **challenge** string; IntaSend stores it (encrypted) and echoes it back in a
 * `challenge` field on every event payload. The merchant validates a delivery
 * by comparing that field against their configured challenge.
 *
 * To fit the `verifyWebhook(payload, headers, secret)` seam, `secret` is the
 * configured challenge string. We parse the JSON body, read `challenge`, and
 * compare it constant-time. If the body is unparseable or the challenge is
 * missing/empty, verification fails closed.
 *
 * Event payloads have no `event`/`type` discriminator: the shape determines
 * the resource. Collection events are an invoice (`invoice_id` + `state`);
 * send-money events carry `tracking_id` + `transactions[]`; chargeback events
 * carry `chargeback_id` + `status`.
 *
 * Docs:
 *   https://developers.intasend.com/docs/setting-up-webhooks
 *   webhooks/* (IntaSend/documentation)
 */
import { timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

/** Map an invoice `state` to a canonical webhook action. */
function collectionAction(state: string): WebhookAction {
  switch (state.toUpperCase()) {
    case 'COMPLETE':
    case 'COMPLETED':
      return 'paid'
    case 'FAILED':
      return 'failed'
    case 'PENDING':
    case 'PROCESSING':
      return 'updated'
    default:
      return 'unknown'
  }
}

/** Map a chargeback `status` to a canonical webhook action. */
function chargebackAction(status: string): WebhookAction {
  switch (status.toUpperCase()) {
    case 'COMPLETED':
      return 'refunded'
    case 'CANCELLED':
      return 'cancelled'
    case 'DISPUTED':
      return 'disputed'
    case 'PENDING':
    case 'OVERDUE':
      return 'updated'
    default:
      return 'unknown'
  }
}

interface Classified {
  type: string
  resourceType: WebhookResourceType
  action: WebhookAction
  resourceId: string
}

/**
 * IntaSend events are untyped — infer the resource from the payload shape.
 *   chargeback → has `chargeback_id`
 *   send-money  → has `tracking_id` (+ `transactions`)
 *   collection  → has `invoice_id` / `state`
 */
function classify(payload: Record<string, unknown>): Classified {
  if (payload['chargeback_id'] != null) {
    const status = String(payload['status'] ?? '')
    return {
      type: `chargeback.${status.toLowerCase() || 'updated'}`,
      resourceType: 'refunds',
      action: chargebackAction(status),
      resourceId: String(payload['chargeback_id'] ?? ''),
    }
  }
  if (payload['tracking_id'] != null) {
    const status = String(payload['status'] ?? '')
    return {
      type: `send_money.${status.toLowerCase().replace(/\s+/g, '_') || 'updated'}`,
      resourceType: 'payouts',
      action: 'updated',
      resourceId: String(payload['tracking_id'] ?? ''),
    }
  }
  const state = String(payload['state'] ?? '')
  return {
    type: `collection.${state.toLowerCase() || 'updated'}`,
    resourceType: 'charges',
    action: collectionAction(state),
    resourceId: String(payload['invoice_id'] ?? payload['id'] ?? ''),
  }
}

export function verifyIntasendWebhook(
  payload: Buffer,
  _headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    if (!secret) return false
    const parsed = JSON.parse(payload.toString('utf8')) as Record<string, unknown>
    const challenge = parsed['challenge']
    if (typeof challenge !== 'string' || challenge.length === 0) return false
    const a = Buffer.from(challenge, 'utf8')
    const b = Buffer.from(secret, 'utf8')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export function parseIntasendWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const { type, resourceType, action, resourceId } = classify(payload)
  return [
    {
      platform: 'intasend',
      type,
      resourceType,
      action,
      resourceId,
      payload,
    },
  ]
}

export const IntasendWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyIntasendWebhook,
  parseWebhookEvents: parseIntasendWebhookEvents,
}
