/**
 * Respond.io webhook verification + parsing.
 *
 * Respond.io signs webhook payloads with HMAC-SHA256 over the raw request body.
 * The hex digest is delivered in the `x-respond-signature` header.
 *
 * Docs: https://developers.respond.io/docs/webhooks/lwocem4sq812x-overview
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type { WebhookAction, WebhookEvent, WebhookResourceType } from '../../schema/webhook'

const SIG_HEADER = 'x-respond-signature'

export function verifyRespondIoWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const provided =
      headers[SIG_HEADER] ??
      headers[SIG_HEADER.toLowerCase()] ??
      headers['X-Respond-Signature']
    if (!provided) return false
    const expected = createHmac('sha256', secret).update(payload).digest('hex')
    const a = Buffer.from(expected, 'utf8')
    const b = Buffer.from(provided.trim(), 'utf8')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

/**
 * Respond.io webhook event type -> canonical resource + action.
 *
 * Documented event types (from Respond.io webhook docs):
 *   message.created, contact.created, contact.updated,
 *   conversation.opened, conversation.closed,
 *   contact.assignee.updated, contact.tag.updated
 */
const ACTION_MAP: Record<string, { resourceType: WebhookResourceType; action: WebhookAction }> = {
  'message.created': { resourceType: 'messages', action: 'created' },
  'contact.created': { resourceType: 'contacts', action: 'created' },
  'contact.updated': { resourceType: 'contacts', action: 'updated' },
  'contact.assignee.updated': { resourceType: 'contacts', action: 'assigned' },
  'contact.tag.updated': { resourceType: 'contacts', action: 'updated' },
  'conversation.opened': { resourceType: 'tickets', action: 'reopened' },
  'conversation.closed': { resourceType: 'tickets', action: 'closed' },
}

export function parseRespondIoWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const event = String(payload['event'] ?? '')
  const data = (payload['data'] as Record<string, unknown> | undefined) ?? {}
  const resourceId = String(data['id'] ?? data['contactId'] ?? data['conversationId'] ?? '')
  const mapped = ACTION_MAP[event] ?? {
    resourceType: 'unknown' as WebhookResourceType,
    action: 'unknown' as WebhookAction,
  }
  return [
    {
      id: `respond-io:${event}:${resourceId}`,
      platform: 'respond-io',
      type: event,
      resourceType: mapped.resourceType,
      action: mapped.action,
      resourceId,
      ticketId: mapped.resourceType === 'messages' ? String(data['conversationId'] ?? '') : undefined,
      payload,
    },
  ]
}

export const RespondIoWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyRespondIoWebhook,
  parseWebhookEvents: parseRespondIoWebhookEvents,
}
