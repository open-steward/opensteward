import { createVerify } from 'node:crypto'
import type { WebhookEvent } from '../../schema/webhook'

/**
 * ShipEngine webhook signature verification.
 *
 * ShipEngine signs each webhook delivery using RSA-SHA256.
 * The signature is transmitted in the `x-shipengine-rsa-sha256-signature`
 * header as a base64-encoded string. The signed payload is constructed by
 * concatenating the timestamp and the raw request body:
 *   `${x-shipengine-timestamp}.${rawBody}`
 *
 * The `secret` parameter must be the RSA public key in PEM format, obtained
 * from ShipEngine's JWKS endpoint: https://api.shipengine.com/jwks
 * (select the key whose `kid` matches the `x-shipengine-rsa-sha256-key-id`
 * header value).
 *
 * Reference: https://www.shipengine.com/docs/webhooks/
 */
export function verifyWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  if (!secret) return false

  const signature =
    headers['x-shipengine-rsa-sha256-signature'] ?? ''
  const timestamp =
    headers['x-shipengine-timestamp'] ?? ''

  if (!signature || !timestamp) return false

  try {
    // The signed payload is: "<timestamp>.<rawBody>"
    const signedPayload = Buffer.concat([
      Buffer.from(`${timestamp}.`),
      payload,
    ])

    // Reject timestamps more than 5 minutes old to prevent replay attacks
    const ts = Number(timestamp)
    if (Number.isFinite(ts) && Math.abs(Date.now() - ts * 1000) > 5 * 60 * 1000) {
      return false
    }

    const sigBytes = Buffer.from(signature, 'base64')

    const verifier = createVerify('RSA-SHA256')
    verifier.update(signedPayload)

    return verifier.verify(secret, sigBytes)
  } catch {
    return false
  }
}

/**
 * Parse a ShipEngine webhook payload into canonical WebhookEvents.
 *
 * ShipEngine webhooks carry a `resource_type` field identifying the event kind
 * and a `resource_url` pointing to the affected resource's API endpoint.
 *
 * Known resource_type values:
 *   API_BATCH, API_RATE, API_TRACK, API_CARRIER_CONNECTED,
 *   API_SALES_ORDERS_IMPORTED, API_ORDER_SOURCE_REFRESH_COMPLETE,
 *   API_REPORT_COMPLETE
 *
 * Reference: https://www.shipengine.com/docs/webhooks/
 */
export function parseWebhookEvents(
  payload: Record<string, unknown>,
): WebhookEvent[] {
  const resourceType = String(payload['resource_type'] ?? '')
  if (!resourceType) return []

  type CanonicalResource = WebhookEvent['resourceType']
  type CanonicalAction = WebhookEvent['action']

  const resourceTypeMap: Record<string, CanonicalResource> = {
    API_BATCH: 'shipment',
    API_RATE: 'rate',
    API_TRACK: 'tracking_event',
    API_CARRIER_CONNECTED: 'carrier',
    API_SALES_ORDERS_IMPORTED: 'order',
    API_ORDER_SOURCE_REFRESH_COMPLETE: 'order',
    API_REPORT_COMPLETE: 'manifest',
  }

  const canonical = resourceTypeMap[resourceType]
  if (!canonical) return []

  const actionMap: Record<string, CanonicalAction> = {
    API_BATCH: 'updated',
    API_RATE: 'updated',
    API_TRACK: 'updated',
    API_CARRIER_CONNECTED: 'created',
    API_SALES_ORDERS_IMPORTED: 'created',
    API_ORDER_SOURCE_REFRESH_COMPLETE: 'updated',
    API_REPORT_COMPLETE: 'updated',
  }

  const action: CanonicalAction = actionMap[resourceType] ?? 'updated'

  // resource_url contains the full API URL for the affected resource
  const resourceUrl = String(payload['resource_url'] ?? '')
  const resourceId = resourceUrl ? resourceUrl.split('/').pop() : undefined

  return [
    {
      platform: 'shipengine',
      type: resourceType,
      resourceType: canonical,
      action,
      resourceId: resourceId || undefined,
      payload,
    },
  ]
}

export const shipengineWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook,
  parseWebhookEvents,
}
