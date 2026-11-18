import crypto from 'node:crypto'
import type { WebhookEvent } from '../../schema/webhook'

/**
 * Verify a Planhat webhook using HMAC-SHA256.
 * The signature is provided in the `x-planhat-signature` header.
 */
export function verifyPlanhatWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  const sig = headers['x-planhat-signature'] ?? ''
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
 * Parse a Planhat webhook payload into canonical WebhookEvents.
 */
export function parsePlanhatWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const type = String(payload['type'] ?? payload['event'] ?? 'unknown')
  const objectType = String(payload['object'] ?? payload['model'] ?? 'unknown').toLowerCase()
  const action = String(payload['action'] ?? 'unknown').toLowerCase()
  const data = (payload['data'] ?? payload['object_data'] ?? {}) as Record<string, unknown>
  const resourceId = String(data['_id'] ?? data['id'] ?? 'unknown')

  return [{
    platform: 'planhat',
    type,
    resourceType: objectType as WebhookEvent['resourceType'],
    action: ACTION_MAP[action] ?? 'unknown',
    resourceId,
    payload,
  }]
}

export const planhatWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook: verifyPlanhatWebhook,
  parseWebhookEvents: parsePlanhatWebhookEvents,
}
