import { createHmac, timingSafeEqual } from 'crypto'
import type { WebhookEvent } from '../../schema/webhook'

/**
 * Samsara webhook signature verification.
 *
 * Samsara signs each webhook notification using HMAC-SHA256 over:
 *   v1:<X-Samsara-Timestamp>:<raw body string>
 *
 * The secret key is Base64-encoded on the Samsara dashboard and must be
 * decoded before use. The computed digest is compared with the value in the
 * X-Samsara-Signature header, which has the form: v1=<hex-digest>
 *
 * Reference: https://developers.samsara.com/docs/webhooks
 */
export function verifyWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  const signature = headers['x-samsara-signature'] ?? ''
  const timestamp = headers['x-samsara-timestamp'] ?? ''
  if (!signature || !timestamp) return false

  // Strip the v1= prefix
  const sigValue = signature.startsWith('v1=') ? signature.slice(3) : signature

  // The secret is Base64-encoded; decode it
  const secretBytes = Buffer.from(secret, 'base64')

  const bodyStr = payload.toString('utf8')
  const message = `v1:${timestamp}:${bodyStr}`

  const expected = createHmac('sha256', secretBytes)
    .update(message, 'utf8')
    .digest('hex')

  try {
    return timingSafeEqual(
      Buffer.from(sigValue, 'utf8'),
      Buffer.from(expected, 'utf8'),
    )
  } catch {
    return false
  }
}

/**
 * Parse a Samsara webhook notification into canonical WebhookEvents.
 *
 * Samsara webhooks carry an `eventType` string (e.g. "RouteStopArrival",
 * "RouteStopDeparture", "RouteComplete") and a `data` object containing the
 * affected resource.
 *
 * Reference: https://developers.samsara.com/docs/webhooks
 */
export function parseWebhookEvents(
  payload: Record<string, unknown>,
): WebhookEvent[] {
  const eventType = String(payload['eventType'] ?? payload['event_type'] ?? '')
  const data = (payload['data'] ?? payload) as Record<string, unknown>
  const routeId =
    (data['routeId'] as string | undefined) ??
    (data['id'] as string | undefined) ??
    undefined

  type CanonicalAction = WebhookEvent['action']

  let action: CanonicalAction = 'updated'
  if (
    eventType === 'RouteComplete' ||
    eventType === 'RouteStopDeparture'
  ) {
    action = 'updated'
  } else if (eventType === 'RouteDeleted') {
    action = 'deleted'
  } else if (eventType === 'RouteCreated') {
    action = 'created'
  }

  return [
    {
      platform: 'samsara',
      type: eventType || 'unknown',
      resourceType: 'shipment',
      action,
      resourceId: routeId,
      payload: data,
    },
  ]
}

export const samsaraWebhook = {
  verifyWebhook,
  parseWebhookEvents,
}
