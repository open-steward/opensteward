/**
 * Snipcart webhook event parsing.
 *
 * Snipcart does NOT use HMAC signing. Each inbound webhook request includes
 * an `X-Snipcart-RequestToken` header containing a one-hour-valid token.
 * Callers should validate this token by making a GET request to:
 *   GET https://app.snipcart.com/api/requestvalidation/{token}
 *
 * `verifyWebhook` here only performs the structural check (token header
 * present). The actual remote validation must be done by the caller using
 * the Snipcart REST API with valid credentials — we surface the token so it
 * can be passed through.
 *
 * Snipcart places the event name in the `eventName` field of the payload
 * (e.g. "order.completed"). Events wrap their content in a `content` object.
 *
 * Docs: https://docs.snipcart.com/v3/webhooks/order-events
 */

import type { WebhookEvent, WebhookResourceType, WebhookAction } from '../../schema/webhook'

// ── Event name → canonical mapping ────────────────────────────────────────────

const EVENT_RESOURCE_MAP: Record<string, WebhookResourceType> = {
  'order.completed': 'orders',
  'order.status.changed': 'orders',
  'order.paymentStatus.changed': 'orders',
  'order.trackingNumber.changed': 'orders',
  'order.notification.created': 'orders',
  'order.refund.created': 'refunds',
  'order.withdrawal.created': 'orders',
}

const EVENT_ACTION_MAP: Record<string, WebhookAction> = {
  'order.completed': 'created',
  'order.status.changed': 'updated',
  'order.paymentStatus.changed': 'updated',
  'order.trackingNumber.changed': 'updated',
  'order.notification.created': 'created',
  'order.refund.created': 'created',
  'order.withdrawal.created': 'created',
}

/**
 * Snipcart webhook verification.
 *
 * Only checks that the `X-Snipcart-RequestToken` header is present.
 * Full verification requires a remote call to
 * `GET /api/requestvalidation/{token}` using the merchant's API credentials,
 * which is outside the scope of a synchronous `verifyWebhook` call.
 *
 * Callers requiring strict verification should reject the payload if
 * `headers['x-snipcart-requesttoken']` is absent, then perform the async
 * remote check with the token value independently.
 */
export function verifySnipcartWebhook(
  _payload: Buffer,
  headers: Record<string, string>,
  _secret: string,
): boolean {
  const token =
    headers['x-snipcart-requesttoken'] ?? headers['X-Snipcart-RequestToken']
  return typeof token === 'string' && token.length > 0
}

/**
 * Parse a Snipcart webhook delivery into a canonical event array (always
 * length 0 or 1). The `eventName` field in the payload body identifies the
 * event type.
 */
export function parseSnipcartWebhookEvents(
  payload: Record<string, unknown>,
): WebhookEvent[] {
  const eventName = (payload['eventName'] as string | undefined) ?? ''
  const resourceType: WebhookResourceType = EVENT_RESOURCE_MAP[eventName] ?? 'unknown'
  const action: WebhookAction = EVENT_ACTION_MAP[eventName] ?? 'unknown'

  const content = payload['content'] as Record<string, unknown> | undefined
  const token = (content?.['token'] ?? content?.['orderToken'] ?? '') as string

  return [
    {
      platform: 'snipcart',
      type: eventName || `${resourceType}.${action}`,
      resourceType,
      action,
      resourceId: token,
      payload,
    },
  ]
}

export const snipcartWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook: verifySnipcartWebhook,
  parseWebhookEvents: parseSnipcartWebhookEvents,
}
