import { createHmac, timingSafeEqual } from 'crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type { WebhookEvent } from '../../schema/webhook'

/**
 * Sinay webhook signature verification using the Svix signing scheme.
 *
 * Svix signs each delivery with HMAC-SHA256 over the concatenation:
 *   `${svix-id}.${svix-timestamp}.${rawBody}`
 *
 * The secret is base64-encoded and prefixed with "whsec_".
 * The `svix-signature` header contains one or more space-separated
 * "v1,<base64-digest>" tokens; we verify against at least one.
 *
 * Reference: https://docs.svix.com/receiving/verifying-payloads/how
 */
export function verifyWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  const msgId = headers['svix-id'] ?? ''
  const timestamp = headers['svix-timestamp'] ?? ''
  const sigHeader = headers['svix-signature'] ?? ''

  if (!msgId || !timestamp || !sigHeader) return false

  // Decode the secret (strip optional "whsec_" prefix)
  const rawSecret = secret.startsWith('whsec_') ? secret.slice(6) : secret
  let keyBuf: Buffer
  try {
    keyBuf = Buffer.from(rawSecret, 'base64')
  } catch {
    return false
  }

  const bodyStr = payload.toString('utf8')
  const toSign = `${msgId}.${timestamp}.${bodyStr}`

  const expected = createHmac('sha256', keyBuf).update(toSign, 'utf8').digest('base64')

  // The header may contain multiple signatures; verify against each
  const signatures = sigHeader.split(' ')
  for (const sig of signatures) {
    const parts = sig.split(',')
    if (parts.length < 2) continue
    const version = parts[0]
    const digest = parts.slice(1).join(',')
    if (version !== 'v1') continue
    try {
      if (timingSafeEqual(Buffer.from(digest, 'utf8'), Buffer.from(expected, 'utf8'))) {
        return true
      }
    } catch {
      // length mismatch — not a match
    }
  }
  return false
}

/**
 * Parse a Sinay / SafeCube webhook notification into canonical WebhookEvents.
 *
 * Sinay uses Svix for delivery.  The event type is carried in the Svix
 * `event-type` request header; the payload is the raw shipment data.
 *
 * Supported canonical event types:
 *   shipment.added.to.endpoint → created
 *   shipment.any.change        → updated
 *   shipment.auto.removed      → deleted
 *   shipment.in.error          → updated (error state)
 *   container.*                → updated
 *   (any other)                → updated
 */
export function parseWebhookEvents(
  payload: Record<string, unknown>,
): WebhookEvent[] {
  const eventType = String(payload['eventType'] ?? payload['type'] ?? 'shipment.any.change')
  const shipmentNumber =
    payload['shipmentNumber'] != null
      ? String(payload['shipmentNumber'])
      : (payload['containerNumber'] != null ? String(payload['containerNumber']) : undefined)

  type CanonicalAction = WebhookEvent['action']

  let action: CanonicalAction
  if (eventType.includes('added') || eventType.includes('created')) {
    action = 'created'
  } else if (eventType.includes('removed') || eventType.includes('deleted')) {
    action = 'deleted'
  } else {
    action = 'updated'
  }

  const resourceType = eventType.startsWith('container') ? 'tracking_event' : 'shipment'

  return [
    {
      platform: 'sinay',
      type: eventType,
      resourceType,
      action,
      resourceId: shipmentNumber,
      payload,
    },
  ]
}

export const sinayWebhook: WebhookHandler = {
  verifyWebhook,
  parseWebhookEvents,
}
