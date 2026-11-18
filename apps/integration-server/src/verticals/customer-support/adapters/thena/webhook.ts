/**
 * Thena webhook parsing.
 *
 * Thena platform events follow the envelope:
 *   { eventId, eventType, timestamp, orgId, actor, payload, metadata }
 *
 * Thena does not document HMAC signature verification for webhooks; the
 * verifyWebhook method always returns true (rely on network-layer controls
 * such as allowlisted IPs or shared secrets passed in request bodies).
 *
 * Docs: https://docs.thena.ai/platform/platform-events
 */
import type { WebhookHandler } from '@opensteward/shared'
import type { WebhookAction, WebhookEvent, WebhookResourceType } from '../../schema/webhook'

export function verifyThenaWebhook(
  _payload: Buffer,
  _headers: Record<string, string>,
  _secret: string,
): boolean {
  // Thena does not publish a webhook signing scheme; verification is not possible.
  return true
}

const ACTION_MAP: Record<string, { resourceType: WebhookResourceType; action: WebhookAction }> = {
  'ticket:created': { resourceType: 'tickets', action: 'created' },
  'ticket:updated': { resourceType: 'tickets', action: 'updated' },
  'ticket:deleted': { resourceType: 'tickets', action: 'deleted' },
  'ticket:archived': { resourceType: 'tickets', action: 'closed' },
  'ticket:status:changed': { resourceType: 'tickets', action: 'updated' },
  'ticket:priority:changed': { resourceType: 'tickets', action: 'updated' },
  'ticket:assigned': { resourceType: 'tickets', action: 'assigned' },
  'ticket:escalated': { resourceType: 'tickets', action: 'updated' },
  'ticket:comment:added': { resourceType: 'messages', action: 'commented' },
  'ticket:comment:updated': { resourceType: 'messages', action: 'updated' },
  'ticket:comment:deleted': { resourceType: 'messages', action: 'deleted' },
  'ticket:csat:received': { resourceType: 'tickets', action: 'rated' },
  'user:mentioned': { resourceType: 'users', action: 'mentioned' },
}

export function parseThenaWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const eventType = String(payload['eventType'] ?? '')
  const eventId = String(payload['eventId'] ?? '')
  const innerPayload = (payload['payload'] as Record<string, unknown> | undefined) ?? {}
  const metadata = (payload['metadata'] as Record<string, unknown> | undefined) ?? {}

  // Derive the resource ID: tickets use payload.id or metadata.entityId
  const resourceId =
    pickId(innerPayload) ??
    pickId(metadata) ??
    eventId

  const mapped = ACTION_MAP[eventType] ?? {
    resourceType: 'unknown' as WebhookResourceType,
    action: 'unknown' as WebhookAction,
  }

  const ticketId =
    mapped.resourceType === 'messages'
      ? (pickStr(metadata['entityId']) ?? pickStr(innerPayload['ticketId']) ?? resourceId)
      : undefined

  return [
    {
      id: eventId || undefined,
      platform: 'thena',
      type: eventType,
      resourceType: mapped.resourceType,
      action: mapped.action,
      resourceId,
      ticketId,
      payload,
    },
  ]
}

function pickId(obj: Record<string, unknown>): string | undefined {
  const v = obj['id'] ?? obj['uid'] ?? obj['ticketId'] ?? obj['entityId']
  if (v == null) return undefined
  return String(v)
}

function pickStr(v: unknown): string | undefined {
  if (v == null) return undefined
  if (typeof v === 'string' && v.length > 0) return v
  return String(v)
}

export const ThenaWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyThenaWebhook,
  parseWebhookEvents: parseThenaWebhookEvents,
}
