/**
 * PhonePe Standard Checkout V2 webhooks.
 *
 * PhonePe does NOT sign the body with an HMAC. Instead, the merchant
 * configures a webhook username + password in the PhonePe dashboard, and
 * every callback carries `Authorization: <hex SHA-256 of "username:password">`.
 * Verification is a constant-time compare of that header against the
 * SHA-256 of the merchant's configured `username:password` pair.
 *
 * We accept the credential pair through the standard `secret` argument in
 * the `"username:password"` form. If the operator instead stored only a
 * pre-hashed value, a direct case-insensitive hex compare also passes.
 *
 * Event names use dot-notation under the `event` field (the legacy `type`
 * field is deprecated): `checkout.order.completed`, `checkout.order.failed`,
 * `pg.refund.completed`, `pg.refund.accepted`, `pg.refund.failed`. Order
 * details ride in `payload`.
 *
 * Docs: https://developer.phonepe.com/payment-gateway/website-integration/standard-checkout/api-integration/webhook-handling
 */
import { createHash, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

const RESOURCE_MAP: Record<string, WebhookResourceType> = {
  checkout: 'charges',
  order: 'charges',
  pg: 'refunds', // pg.refund.* events
  refund: 'refunds',
}

const ACTION_MAP: Record<string, WebhookAction> = {
  completed: 'succeeded',
  failed: 'failed',
  accepted: 'created',
  cancelled: 'cancelled',
  created: 'created',
  pending: 'created',
}

/**
 * Classify a PhonePe dot-notation event. The resource is the token
 * immediately before the verb: `checkout.order.completed` → resource
 * `order`, verb `completed`; `pg.refund.completed` → resource `refund`,
 * verb `completed`.
 */
function classify(eventType: string): { resourceType: WebhookResourceType; action: WebhookAction } {
  const tokens = eventType.toLowerCase().split('.').filter(Boolean)
  if (tokens.length === 0) return { resourceType: 'unknown', action: 'unknown' }
  const verb = tokens[tokens.length - 1]
  const resourceToken = tokens.length >= 2 ? tokens[tokens.length - 2] : tokens[0]
  return {
    resourceType: RESOURCE_MAP[resourceToken] ?? RESOURCE_MAP[tokens[0]] ?? 'unknown',
    action: ACTION_MAP[verb] ?? 'unknown',
  }
}

function safeHexEqual(a: string, b: string): boolean {
  const lowerA = a.trim().toLowerCase()
  const lowerB = b.trim().toLowerCase()
  if (lowerA.length === 0 || lowerA.length !== lowerB.length) return false
  return timingSafeEqual(Buffer.from(lowerA, 'utf8'), Buffer.from(lowerB, 'utf8'))
}

export function verifyPhonepeWebhook(
  _payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    if (!secret) return false
    const received = headers['authorization'] ?? headers['Authorization']
    if (!received) return false
    // PhonePe sends the SHA-256 hex of "username:password". The operator may
    // have stored either the raw "username:password" pair or the pre-hashed
    // value; accept whichever matches.
    const hashedSecret = createHash('sha256').update(secret).digest('hex')
    return safeHexEqual(received, hashedSecret) || safeHexEqual(received, secret)
  } catch {
    return false
  }
}

export function parsePhonepeWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  // Prefer `event`; fall back to the deprecated `type`.
  const eventType = String(payload['event'] ?? payload['type'] ?? '')
  const data = (payload['payload'] as Record<string, unknown> | undefined) ?? {}
  const resourceId = String(
    data['merchantRefundId'] ??
      data['refundId'] ??
      data['merchantOrderId'] ??
      data['orderId'] ??
      '',
  )
  const { resourceType, action } = classify(eventType)
  return [
    {
      platform: 'phonepe',
      type: eventType,
      resourceType,
      action,
      resourceId,
      payload,
    },
  ]
}

export const PhonepeWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyPhonepeWebhook,
  parseWebhookEvents: parsePhonepeWebhookEvents,
}
