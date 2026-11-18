import crypto from 'node:crypto'
import type { WebhookEvent } from '../../schema/webhook'

/**
 * Verify the HubSpot webhook signature.
 *
 * HubSpot v3 signatures: HMAC-SHA256 of (requestUri + rawBody), hex-encoded,
 * delivered in the `X-HubSpot-Signature-v3` header.
 *
 * Falls back to the simpler v1 format (HMAC-SHA256 of rawBody only) via
 * `X-HubSpot-Signature` if the v3 header is absent.
 */
export function verifyHubSpotWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
  requestUri?: string,
): boolean {
  const sigV3 = headers['x-hubspot-signature-v3']
  if (sigV3) {
    const data = (requestUri ?? '') + payload.toString('utf8')
    const expected = crypto
      .createHmac('sha256', secret)
      .update(data)
      .digest('hex')
    try {
      return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sigV3))
    } catch {
      return false
    }
  }

  // Fallback to v1
  const sigV1 = headers['x-hubspot-signature']
  if (sigV1) {
    const expected = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex')
    try {
      return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sigV1))
    } catch {
      return false
    }
  }

  return false
}

/**
 * Parse HubSpot webhook events.
 *
 * HubSpot delivers an array of event objects in the request body.
 * Each has a `subscriptionType` like "contact.creation" or "deal.propertyChange".
 */
export function parseHubSpotWebhookEvents(
  payload: Record<string, unknown>,
): WebhookEvent[] {
  const events = Array.isArray(payload) ? payload : [payload]

  return events.map((event) => {
    const subscriptionType = String((event as Record<string, unknown>)['subscriptionType'] ?? 'unknown')
    const action = subscriptionType.split('.')[1]
    const objectId = String(
      (event as Record<string, unknown>)['objectId'] ??
      (event as Record<string, unknown>)['id'] ??
      'unknown',
    )

    return {
      platform: 'hubspot',
      type: subscriptionType,
      resourceType: 'unknown' as WebhookEvent['resourceType'],
      action: mapAction(action ?? ''),
      resourceId: objectId,
      tenantId: String(
        (event as Record<string, unknown>)['portalId'] ?? '',
      ) || undefined,
      payload: event as Record<string, unknown>,
    }
  })

  function mapAction(raw: string): WebhookEvent['action'] {
    if (raw === 'creation') return 'created'
    if (raw === 'deletion') return 'deleted'
    if (raw === 'propertyChange') return 'updated'
    return 'unknown'
  }
}


export const hubspotWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook: verifyHubSpotWebhook,
  parseWebhookEvents: parseHubSpotWebhookEvents,
}
