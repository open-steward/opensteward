import { createHmac, timingSafeEqual } from 'crypto'
import type { WebhookEvent } from '../../schema/webhook'

/**
 * TrackingMore V4 webhook signature verification.
 *
 * TrackingMore signs each webhook notification using HMAC-SHA256 over the
 * raw JSON body, keyed with the webhook secret. The hex digest is sent in
 * the `Hmac-Sha256` request header.
 *
 * Reference: https://www.trackingmore.com/docs/trackingmore/yy2jwwjtwdapz-webhook-specifications
 */
export function verifyWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  // TrackingMore sends the signature in the 'Hmac-Sha256' header (case-insensitive lookup)
  const signature =
    headers['hmac-sha256'] ??
    headers['Hmac-Sha256'] ??
    headers['HMAC-SHA256'] ??
    ''
  if (!signature) return false

  const expected = createHmac('sha256', secret)
    .update(payload)
    .digest('hex')

  try {
    return timingSafeEqual(
      Buffer.from(signature, 'utf8'),
      Buffer.from(expected, 'utf8'),
    )
  } catch {
    return false
  }
}

/**
 * Parse a TrackingMore webhook notification into canonical WebhookEvents.
 *
 * TrackingMore V4 webhook payload structure:
 *   {
 *     "event": "tracking_update",
 *     "msg": "...",
 *     "data": {
 *       "tracking_number": "...",
 *       "courier_code": "...",
 *       "status": "...",
 *       ...
 *     }
 *   }
 */
export function parseWebhookEvents(
  payload: Record<string, unknown>,
): WebhookEvent[] {
  const event = String(payload['event'] ?? '')
  const data = payload['data'] as Record<string, unknown> | undefined

  type CanonicalAction = WebhookEvent['action']

  let action: CanonicalAction
  switch (event) {
    case 'tracking_update':
    case 'tracking_updated':
      action = 'updated'
      break
    default:
      action = 'updated'
  }

  const resourceId =
    data?.['tracking_number'] != null
      ? String(data['tracking_number'])
      : undefined

  return [
    {
      platform: 'trackingmore',
      type: event,
      resourceType: 'tracking_event',
      action,
      resourceId,
      payload: data ?? payload,
    },
  ]
}

export const trackingmoreWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook,
  parseWebhookEvents,
}
