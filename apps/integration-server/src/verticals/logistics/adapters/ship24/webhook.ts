import { timingSafeEqual } from 'crypto'
import type { WebhookEvent } from '../../schema/webhook'
import type { WebhookHandler } from '@opensteward/shared'
import type { Ship24TrackingResult } from './transform/tracking'

/**
 * Ship24 webhook authentication.
 *
 * Ship24 allocates a Webhook Secret that is sent in the Authorization header
 * of every webhook request as a Bearer token:
 *
 *   Authorization: Bearer <webhook_secret>
 *
 * Verification: compare the received secret against the stored secret using
 * constant-time comparison to prevent timing attacks.
 *
 * Reference: https://docs.ship24.com/webhooks/authentication
 */
export function verifyWebhook(
  _payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  const authHeader = headers['authorization'] ?? headers['Authorization'] ?? ''
  const prefix = 'Bearer '
  if (!authHeader.startsWith(prefix)) return false
  const received = authHeader.slice(prefix.length)

  try {
    const a = Buffer.from(received, 'utf8')
    const b = Buffer.from(secret, 'utf8')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

/**
 * Parse a Ship24 webhook payload into canonical WebhookEvents.
 *
 * Ship24 sends a `trackings` array where each entry contains a `tracker`,
 * `shipment`, `events`, and `statistics` object. We emit one WebhookEvent
 * per tracking result entry (representing a shipment update).
 *
 * Payload shape:
 * {
 *   metadata: { generatedAt, messageId, topic },
 *   trackings: [{ tracker, shipment, events, statistics }]
 * }
 *
 * Reference: https://docs.ship24.com/webhooks/specification
 */
export function parseWebhookEvents(
  payload: Record<string, unknown>,
): WebhookEvent[] {
  const trackings = (payload['trackings'] as Ship24TrackingResult[] | undefined) ?? []

  if (trackings.length === 0) {
    return [
      {
        platform: 'ship24',
        type: 'tracking.updated',
        resourceType: 'tracking_event',
        action: 'updated',
        payload,
      },
    ]
  }

  return trackings.map((tracking) => {
    const tracker = tracking.tracker
    return {
      platform: 'ship24',
      type: 'tracking.updated',
      resourceType: 'tracking_event' as const,
      action: 'updated' as const,
      resourceId: tracker?.trackerId ?? tracker?.trackingNumber ?? undefined,
      payload: tracking as unknown as Record<string, unknown>,
    }
  })
}

export const ship24Webhook: WebhookHandler = {
  verifyWebhook,
  parseWebhookEvents,
}
