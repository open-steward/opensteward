import crypto from 'node:crypto'
import type { WebhookEvent } from '../../schema/webhook'

/**
 * Verify an incoming Teamwave webhook by comparing the HMAC-SHA256 signature
 * in the `x-teamwave-signature` header against a locally computed digest.
 */
export function verifyTeamwaveWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  const signature = headers['x-teamwave-signature'] ?? ''
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
 * Parse a raw Teamwave webhook payload into a canonical WebhookEvent array.
 *
 * Teamwave webhooks follow a conventional envelope: `{ event, resource, data }`.
 */
export function parseTeamwaveWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const event = String(payload['event'] ?? 'unknown')
  const resource = String(payload['resource'] ?? 'unknown')
  const data = (payload['data'] ?? {}) as Record<string, unknown>
  const resourceId = String(data['id'] ?? 'unknown')

  let action: WebhookEvent['action'] = 'unknown'
  if (event.includes('created') || event.includes('create')) action = 'created'
  else if (event.includes('updated') || event.includes('update')) action = 'updated'
  else if (event.includes('deleted') || event.includes('delete')) action = 'deleted'

  return [{
    platform: 'teamwave',
    type: `${resource}.${event}`.toLowerCase(),
    resourceType: 'unknown',
    action,
    resourceId,
    payload,
  }]
}

export const teamwaveWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook: verifyTeamwaveWebhook,
  parseWebhookEvents: parseTeamwaveWebhookEvents,
}
