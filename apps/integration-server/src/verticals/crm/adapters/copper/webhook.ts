import crypto from 'node:crypto'
import type { WebhookEvent } from '../../schema/webhook'

/**
 * Copper webhooks sign the raw body with HMAC-SHA256 using the webhook secret.
 * The signature is sent in the X-PW-Signature header.
 */
export function verifyWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  const signature = headers['x-pw-signature'] ?? headers['X-PW-Signature']
  if (!signature) return false
  const hash = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex')
  try {
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signature))
  } catch {
    return false
  }
}

interface CopperWebhookMap {
  resourceType: WebhookEvent['resourceType']
  action: WebhookEvent['action']
}

/**
 * Copper webhook type strings follow the pattern:
 * new_person, update_person, delete_person,
 * new_opportunity, update_opportunity, delete_opportunity, etc.
 */
const EVENT_MAP: Record<string, CopperWebhookMap> = {
  'new_person':           { resourceType: 'unknown', action: 'created' },
  'update_person':        { resourceType: 'unknown', action: 'updated' },
  'delete_person':        { resourceType: 'unknown', action: 'deleted' },
  'new_company':          { resourceType: 'unknown', action: 'created' },
  'update_company':       { resourceType: 'unknown', action: 'updated' },
  'delete_company':       { resourceType: 'unknown', action: 'deleted' },
  'new_opportunity':      { resourceType: 'unknown', action: 'created' },
  'update_opportunity':   { resourceType: 'unknown', action: 'updated' },
  'delete_opportunity':   { resourceType: 'unknown', action: 'deleted' },
  'new_lead':             { resourceType: 'unknown', action: 'created' },
  'update_lead':          { resourceType: 'unknown', action: 'updated' },
  'delete_lead':          { resourceType: 'unknown', action: 'deleted' },
  'new_task':             { resourceType: 'unknown', action: 'created' },
  'update_task':          { resourceType: 'unknown', action: 'updated' },
  'delete_task':          { resourceType: 'unknown', action: 'deleted' },
}

export function parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const eventType = String(payload['type'] ?? 'unknown')
  const mapped = EVENT_MAP[eventType] ?? { resourceType: 'unknown' as const, action: 'unknown' as const }
  const ids = payload['ids'] as number[] | undefined
  const resourceId = String(ids?.[0] ?? payload['id'] ?? 'unknown')

  return [{
    platform: 'copper',
    type: eventType,
    resourceType: mapped.resourceType,
    action: mapped.action,
    resourceId,
    payload,
  }]
}

export const copperWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook: verifyWebhook,
  parseWebhookEvents: parseWebhookEvents,
}
