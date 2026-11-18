/**
 * Crossmint webhook verification + event parsing.
 *
 * Crossmint signs deliveries with Svix. The signed content is
 * `${svix-id}.${svix-timestamp}.${rawBody}`, HMAC-SHA256'd with the base64
 * portion of the signing secret (the part after the `whsec_` prefix). The
 * `svix-signature` header is a space-delimited list of `v1,<base64sig>`
 * entries; a delivery is valid if any entry matches. A ±5-minute timestamp
 * tolerance guards against replay.
 *
 * Event types are `orders.<phase>.<verb>`, e.g. `orders.payment.succeeded`,
 * `orders.delivery.completed`. The payload carries `{ type, payload: {
 * orderIdentifier, … } }`.
 *
 * Docs: https://docs.crossmint.com/introduction/platform/webhooks/verify-webhooks
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

const TOLERANCE_SECONDS = 5 * 60

/** Strip the `whsec_` prefix and base64-decode the signing secret. */
function secretKeyBytes(secret: string): Buffer {
  const raw = secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret
  return Buffer.from(raw, 'base64')
}

export function verifyCrossmintWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    if (!secret) return false
    const id = headers['svix-id'] ?? headers['Svix-Id']
    const timestamp = headers['svix-timestamp'] ?? headers['Svix-Timestamp']
    const signatureHeader = headers['svix-signature'] ?? headers['Svix-Signature']
    if (!id || !timestamp || !signatureHeader) return false

    const ts = parseInt(timestamp, 10)
    if (!Number.isFinite(ts)) return false
    const now = Math.floor(Date.now() / 1000)
    if (Math.abs(now - ts) > TOLERANCE_SECONDS) return false

    const signedContent = `${id}.${timestamp}.${payload.toString('utf8')}`
    const expected = createHmac('sha256', secretKeyBytes(secret))
      .update(signedContent)
      .digest('base64')
    const expectedBuf = Buffer.from(expected, 'base64')

    // Header: space-delimited "v1,<sig>" entries — accept if any version matches.
    return signatureHeader.split(' ').some((entry) => {
      const comma = entry.indexOf(',')
      const sig = comma === -1 ? entry : entry.slice(comma + 1)
      const sigBuf = Buffer.from(sig, 'base64')
      if (sigBuf.length !== expectedBuf.length) return false
      return timingSafeEqual(sigBuf, expectedBuf)
    })
  } catch {
    return false
  }
}

const RESOURCE_MAP: Record<string, WebhookResourceType> = {
  quote: 'charges',
  payment: 'charges',
  delivery: 'charges',
}

const ACTION_MAP: Record<string, WebhookAction> = {
  created: 'created',
  updated: 'updated',
  succeeded: 'paid',
  failed: 'failed',
  initiated: 'created',
  completed: 'succeeded',
}

function classify(eventType: string): {
  resourceType: WebhookResourceType
  action: WebhookAction
} {
  // Crossmint event format: `orders.<phase>.<verb>`.
  const parts = eventType.toLowerCase().split('.')
  const phase = parts[1] ?? ''
  const verb = parts[2] ?? ''
  return {
    resourceType: RESOURCE_MAP[phase] ?? 'unknown',
    action: ACTION_MAP[verb] ?? 'unknown',
  }
}

export function parseCrossmintWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const type = String(payload['type'] ?? '')
  const data = (payload['payload'] as Record<string, unknown> | undefined) ?? {}
  const resourceId = String(data['orderIdentifier'] ?? data['orderId'] ?? '')
  const { resourceType, action } = classify(type)
  return [
    {
      platform: 'crossmint',
      type,
      resourceType,
      action,
      resourceId,
      payload,
    },
  ]
}

export const CrossmintWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyCrossmintWebhook,
  parseWebhookEvents: parseCrossmintWebhookEvents,
}
