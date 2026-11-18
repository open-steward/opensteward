/**
 * Zendesk webhook verification + parsing.
 *
 * Zendesk signs webhooks with HMAC-SHA256 over body, base64-encoded,
 * delivered in `X-Zendesk-Webhook-Signature`. Timestamp in
 * `X-Zendesk-Webhook-Signature-Timestamp` is part of the signed payload
 * (timestamp + body).
 *
 * Docs: https://developer.zendesk.com/documentation/webhooks/verifying/
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type { WebhookAction, WebhookEvent, WebhookResourceType } from '../../schema/webhook'

const SIG_HEADERS = ['x-chatwoot-signature', 'X-Chatwoot-Signature']
const TS_HEADERS = ['x-chatwoot-signature-timestamp', 'X-Chatwoot-Signature-Timestamp']

export function verifyChatwootWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const timestamp = TS_HEADERS.map((h) => headers[h] ?? headers[h.toLowerCase()]).find(Boolean)
    const provided = SIG_HEADERS.map((h) => headers[h] ?? headers[h.toLowerCase()]).find(Boolean)
    if (!timestamp || !provided) return false
    const signedPayload = Buffer.concat([Buffer.from(timestamp), payload])
    const expected = createHmac('sha256', secret).update(signedPayload).digest('base64')
    const a = Buffer.from(expected, 'utf8')
    const b = Buffer.from(provided.trim(), 'utf8')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

const ACTION_MAP: Record<string, { resourceType: WebhookResourceType; action: WebhookAction }> = {
  'zen:event-type:ticket.created': { resourceType: 'tickets', action: 'created' },
  'zen:event-type:ticket.updated': { resourceType: 'tickets', action: 'updated' },
  'zen:event-type:ticket.status_changed': { resourceType: 'tickets', action: 'updated' },
  'zen:event-type:ticket.comment_added': { resourceType: 'messages', action: 'commented' },
  'zen:event-type:user.created': { resourceType: 'contacts', action: 'created' },
  'zen:event-type:user.updated': { resourceType: 'contacts', action: 'updated' },
}

export function parseChatwootWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const type = String(payload['type'] ?? '')
  const detail = (payload['detail'] as Record<string, unknown> | undefined) ?? {}
  const ticketId = String(detail['id'] ?? '')
  const mapped = ACTION_MAP[type] ?? { resourceType: 'unknown' as WebhookResourceType, action: 'unknown' as WebhookAction }
  return [
    {
      id: `zendesk:${type}:${ticketId}`,
      platform: 'chatwoot',
      type,
      resourceType: mapped.resourceType,
      action: mapped.action,
      resourceId: ticketId,
      ticketId: mapped.resourceType === 'messages' ? ticketId : undefined,
      payload,
    },
  ]
}

export const ChatwootWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyChatwootWebhook,
  parseWebhookEvents: parseChatwootWebhookEvents,
}
