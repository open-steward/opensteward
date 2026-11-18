import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookEvent } from '../../schema/webhook'
import type { WebhookHandler } from '@opensteward/shared'
import {
  WEBHOOK_SIGNATURE_HEADER,
  WEBHOOK_MAX_AGE_MS,
} from './constants'

// ── Signature verification ───────────────────────────────────────────────────

/**
 * GoFreight sends `x-gofreight-signature: {timestamp}.{hmac_sha256_hex}`.
 * The signed string is `{timestamp}.{raw_json_body}` using the subscription
 * secret as the HMAC key.
 */
function verifyWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const sigHeader =
      headers[WEBHOOK_SIGNATURE_HEADER] ?? headers[WEBHOOK_SIGNATURE_HEADER.toLowerCase()]
    if (!sigHeader || !secret) return false

    // Format: "{timestamp}.{hex_signature}"
    const dotIndex = sigHeader.indexOf('.')
    if (dotIndex < 0) return false

    const timestampStr = sigHeader.slice(0, dotIndex)
    const receivedSig = sigHeader.slice(dotIndex + 1)
    const timestamp = parseFloat(timestampStr)
    if (!Number.isFinite(timestamp)) return false

    // Replay protection — timestamp is a Unix seconds float
    const ageMs = Math.abs(Date.now() - timestamp * 1000)
    if (ageMs > WEBHOOK_MAX_AGE_MS) return false

    // Reconstruct signed string: "{timestamp}.{raw_body}"
    const signedPayload = Buffer.concat([Buffer.from(`${timestampStr}.`), payload])
    const computed = createHmac('sha256', secret).update(signedPayload).digest('hex')

    const a = Buffer.from(computed)
    const b = Buffer.from(receivedSig)
    if (a.length !== b.length) return false

    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

// ── Event parsing ────────────────────────────────────────────────────────────

/**
 * Maps a GoFreight event_type to canonical (resourceType, action) pairs.
 */
function mapEventType(eventType: string): {
  resourceType: WebhookEvent['resourceType']
  action: WebhookEvent['action']
} | null {
  // Ocean import/export master bills → shipment
  if (eventType.match(/^(oi_mbl|oe_mbl)\.(created|updated|deleted)$/)) {
    const action = eventType.split('.')[1] as WebhookEvent['action']
    return { resourceType: 'shipment', action }
  }

  // House bills → order
  if (eventType.match(/^(oi_hbl|oe_hbl)\.(created|updated|deleted)$/)) {
    const action = eventType.split('.')[1] as WebhookEvent['action']
    return { resourceType: 'order', action }
  }

  // Containers → shipment
  if (eventType.match(/^container\.(created|updated|deleted)$/)) {
    const action = eventType.split('.')[1] as WebhookEvent['action']
    return { resourceType: 'shipment', action }
  }

  return null
}

function parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const eventType = (payload.event_type as string | undefined) ?? ''
  const ref = (payload.ref as string | undefined) ?? undefined
  const mapped = mapEventType(eventType)

  if (!mapped) return []

  return [
    {
      platform: 'gofreight',
      type: eventType,
      resourceType: mapped.resourceType,
      action: mapped.action,
      resourceId: ref,
      payload,
    },
  ]
}

// ── Export ───────────────────────────────────────────────────────────────────

export const gofreightWebhook: WebhookHandler = {
  verifyWebhook,
  parseWebhookEvents,
}
