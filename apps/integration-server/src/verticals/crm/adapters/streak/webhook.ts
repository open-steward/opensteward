import crypto from 'node:crypto'
import type { WebhookEvent } from '../../schema/webhook'

/**
 * Verify an incoming Streak webhook by comparing the HMAC-SHA256 signature
 * in the `x-streak-signature` header against a locally computed digest.
 */
export function verifyStreakWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  const signature = headers['x-streak-signature'] ?? ''
  if (!signature) return false

  const hmac = crypto.createHmac('sha256', secret)
  hmac.update(payload)
  const digest = hmac.digest('hex')

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(digest),
    )
  } catch {
    return false
  }
}

/**
 * Parse a raw Streak webhook payload into a canonical WebhookEvent array.
 *
 * Streak webhooks include `eventType`, `objectType`, and an `object` payload
 * containing the affected resource.
 */
export function parseStreakWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const eventType = String(payload['eventType'] ?? 'unknown')
  const objectData = (payload['objectData'] ?? {}) as Record<string, unknown>
  const resourceId = String(objectData['key'] ?? objectData['id'] ?? 'unknown')

  let action: WebhookEvent['action'] = 'unknown'
  if (eventType.includes('CREATE') || eventType.includes('create')) action = 'created'
  else if (eventType.includes('UPDATE') || eventType.includes('update')) action = 'updated'
  else if (eventType.includes('DELETE') || eventType.includes('delete')) action = 'deleted'

  return [{
    platform: 'streak',
    type: eventType.toLowerCase(),
    resourceType: 'unknown',
    action,
    resourceId,
    payload,
  }]
}

export const streakWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook: verifyStreakWebhook,
  parseWebhookEvents: parseStreakWebhookEvents,
}
