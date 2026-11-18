import crypto from 'node:crypto'
import type { WebhookEvent } from '../../schema/webhook'

/**
 * Verify a Salesflare webhook using HMAC-SHA256.
 * The signature is provided in the `x-salesflare-signature` header.
 */
export function verifySalesflareWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  const sig = headers['x-salesflare-signature'] ?? ''
  if (!sig) return false
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex')
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  } catch {
    return false
  }
}

const ACTION_MAP: Record<string, WebhookEvent['action']> = {
  created: 'created',
  updated: 'updated',
  deleted: 'deleted',
}

/**
 * Parse a Salesflare webhook payload into canonical WebhookEvents.
 */
export function parseSalesflareWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const type = String(payload['type'] ?? payload['event'] ?? 'unknown')
  const objectType = String(payload['object'] ?? payload['entity'] ?? 'unknown').toLowerCase()
  const action = String(payload['action'] ?? 'unknown').toLowerCase()
  const data = (payload['data'] ?? payload['object_data'] ?? {}) as Record<string, unknown>
  const resourceId = String(data['id'] ?? 'unknown')

  return [{
    platform: 'salesflare',
    type,
    resourceType: objectType as WebhookEvent['resourceType'],
    action: ACTION_MAP[action] ?? 'unknown',
    resourceId,
    payload,
  }]
}

export const salesflareWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook: verifySalesflareWebhook,
  parseWebhookEvents: parseSalesflareWebhookEvents,
}
