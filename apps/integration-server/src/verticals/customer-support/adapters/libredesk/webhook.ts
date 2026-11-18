/**
 * Libredesk webhook verification + parsing.
 *
 * Libredesk signs webhook payloads with HMAC-SHA256 and delivers the
 * hex-encoded digest (prefixed "sha256=") in the X-Libredesk-Signature header.
 *
 * Signed payload: the raw request body bytes.
 * Header: X-Libredesk-Signature: sha256=<hex>
 *
 * Event envelope: { event: string, timestamp: string, payload: object }
 *
 * Documented events:
 *   conversation.created, conversation.status_changed,
 *   conversation.tags_changed, conversation.assigned,
 *   conversation.unassigned, message.created, message.updated
 *
 * Ref: internal/webhook/webhook.go (generateSignature / deliverSingleWebhook)
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type { WebhookAction, WebhookEvent, WebhookResourceType } from '../../schema/webhook'

const SIG_HEADER = 'x-libredesk-signature'

export function verifyLibredeskWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const provided = headers[SIG_HEADER] ?? headers['X-Libredesk-Signature']
    if (!provided) return false
    const expected = 'sha256=' + createHmac('sha256', secret).update(payload).digest('hex')
    const a = Buffer.from(expected, 'utf8')
    const b = Buffer.from(provided.trim(), 'utf8')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

const EVENT_MAP: Record<string, { resourceType: WebhookResourceType; action: WebhookAction }> = {
  'conversation.created': { resourceType: 'tickets', action: 'created' },
  'conversation.status_changed': { resourceType: 'tickets', action: 'updated' },
  'conversation.tags_changed': { resourceType: 'tickets', action: 'updated' },
  'conversation.assigned': { resourceType: 'tickets', action: 'updated' },
  'conversation.unassigned': { resourceType: 'tickets', action: 'updated' },
  'message.created': { resourceType: 'messages', action: 'commented' },
  'message.updated': { resourceType: 'messages', action: 'updated' },
}

export function parseLibredeskWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const event = String(payload['event'] ?? '')
  const timestamp = String(payload['timestamp'] ?? '')
  const inner = (payload['payload'] as Record<string, unknown> | undefined) ?? {}
  const resourceId = String(inner['uuid'] ?? inner['id'] ?? '')
  const conversationUUID = String(
    inner['conversation_uuid'] ?? inner['uuid'] ?? inner['id'] ?? '',
  )

  const mapped = EVENT_MAP[event] ?? {
    resourceType: 'unknown' as WebhookResourceType,
    action: 'unknown' as WebhookAction,
  }

  return [
    {
      id: `libredesk:${event}:${resourceId}:${timestamp}`,
      platform: 'libredesk',
      type: event,
      resourceType: mapped.resourceType,
      action: mapped.action,
      resourceId,
      ticketId: mapped.resourceType === 'messages' ? conversationUUID : undefined,
      payload,
    },
  ]
}

export const LibredeskWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyLibredeskWebhook,
  parseWebhookEvents: parseLibredeskWebhookEvents,
}
