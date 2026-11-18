/**
 * Gallabox webhook verification + event parsing.
 *
 * Gallabox signs outgoing webhooks with HMAC-SHA256 over the raw request body,
 * delivering the hex-encoded digest in the `x-gallabox-signature` header.
 *
 * Verification steps (per Gallabox docs):
 *  1. Extract the signature from the `x-gallabox-signature` header.
 *  2. Compute HMAC-SHA256(secret, rawBody) as a hex string.
 *  3. Compare using a timing-safe equals.
 *
 * Docs: https://docs.gallabox.com/developer-resources/webhook
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type { WebhookAction, WebhookEvent, WebhookResourceType } from '../../schema/webhook'

const SIG_HEADER = 'x-gallabox-signature'

export function verifyGallaboxWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    // Normalise header lookup to lowercase
    const provided = headers[SIG_HEADER] ?? headers[SIG_HEADER.toLowerCase()] ?? ''
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
 * Gallabox webhook event type to canonical resource + action mapping.
 *
 * The exact event type string format is not fully documented, so we match
 * common patterns. Unknown types are mapped to 'unknown'.
 */
const ACTION_MAP: Record<string, { resourceType: WebhookResourceType; action: WebhookAction }> = {
  // Conversation (ticket) events
  'conversation.created': { resourceType: 'tickets', action: 'created' },
  'conversation.assigned': { resourceType: 'tickets', action: 'assigned' },
  'conversation.unassigned': { resourceType: 'tickets', action: 'unassigned' },
  'conversation.resolved': { resourceType: 'tickets', action: 'resolved' },
  'conversation.reopened': { resourceType: 'tickets', action: 'reopened' },
  'conversation.closed': { resourceType: 'tickets', action: 'closed' },
  'conversation.updated': { resourceType: 'tickets', action: 'updated' },
  // Message events
  'message.received': { resourceType: 'messages', action: 'created' },
  'message.sent': { resourceType: 'messages', action: 'created' },
  'message.created': { resourceType: 'messages', action: 'created' },
  // Contact events
  'contact.created': { resourceType: 'contacts', action: 'created' },
  'contact.updated': { resourceType: 'contacts', action: 'updated' },
}

export function parseGallaboxWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const type = String(payload['event'] ?? payload['type'] ?? payload['eventType'] ?? '')
  const data = (payload['data'] as Record<string, unknown> | undefined) ?? payload

  // Try to extract the primary resource ID
  const conversationId = String(
    (data['conversation'] as Record<string, unknown> | undefined)?.['_id'] ??
    (data['conversation'] as Record<string, unknown> | undefined)?.['id'] ??
    data['conversationId'] ??
    data['_id'] ??
    data['id'] ??
    '',
  )

  const messageId = String(
    (data['message'] as Record<string, unknown> | undefined)?.['_id'] ??
    (data['message'] as Record<string, unknown> | undefined)?.['id'] ??
    data['messageId'] ??
    '',
  )

  const mapped = ACTION_MAP[type] ?? {
    resourceType: 'unknown' as WebhookResourceType,
    action: 'unknown' as WebhookAction,
  }

  const isMessage = mapped.resourceType === 'messages'
  const resourceId = isMessage ? (messageId || conversationId) : conversationId

  return [
    {
      id: `gallabox:${type}:${resourceId}`,
      platform: 'gallabox',
      type,
      resourceType: mapped.resourceType,
      action: mapped.action,
      resourceId,
      ticketId: isMessage ? conversationId : undefined,
      payload,
    },
  ]
}

export const GallaboxWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyGallaboxWebhook,
  parseWebhookEvents: parseGallaboxWebhookEvents,
}
