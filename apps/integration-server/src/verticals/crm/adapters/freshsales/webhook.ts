import type { WebhookEvent } from '../../schema/webhook'

/**
 * Freshsales does not provide webhook signature verification.
 * Always returns true.
 */
export function verifyWebhook(
  _payload: Buffer,
  _headers: Record<string, string>,
  _secret: string,
): boolean {
  return true
}

interface FreshsalesWebhookMap {
  resourceType: WebhookEvent['resourceType']
  action: WebhookEvent['action']
}

const EVENT_MAP: Record<string, FreshsalesWebhookMap> = {
  'contact.created': { resourceType: 'unknown', action: 'created' },
  'contact.updated': { resourceType: 'unknown', action: 'updated' },
  'contact.deleted': { resourceType: 'unknown', action: 'deleted' },
  'account.created': { resourceType: 'unknown', action: 'created' },
  'account.updated': { resourceType: 'unknown', action: 'updated' },
  'account.deleted': { resourceType: 'unknown', action: 'deleted' },
  'deal.created': { resourceType: 'unknown', action: 'created' },
  'deal.updated': { resourceType: 'unknown', action: 'updated' },
  'deal.deleted': { resourceType: 'unknown', action: 'deleted' },
  'task.created': { resourceType: 'unknown', action: 'created' },
  'task.updated': { resourceType: 'unknown', action: 'updated' },
  'task.deleted': { resourceType: 'unknown', action: 'deleted' },
  'note.created': { resourceType: 'unknown', action: 'created' },
  'note.updated': { resourceType: 'unknown', action: 'updated' },
  'note.deleted': { resourceType: 'unknown', action: 'deleted' },
}

export function parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const eventType = String(payload['event_type'] ?? 'unknown')
  const mapped = EVENT_MAP[eventType] ?? { resourceType: 'unknown' as const, action: 'unknown' as const }
  const data = (payload['data'] as Record<string, unknown> | undefined) ?? {}
  const resourceId = String(data['id'] ?? (payload['id'] ?? 'unknown'))

  return [{
    platform: 'freshsales',
    type: eventType,
    resourceType: mapped.resourceType,
    action: mapped.action,
    resourceId,
    payload,
  }]
}

export const freshsalesWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook: verifyWebhook,
  parseWebhookEvents: parseWebhookEvents,
}
