/**
 * Gallabox webhook verification and event parsing.
 *
 * Signature: HMAC-SHA256 of the raw request body, delivered in the
 * `x-gallabox-signature` header.
 *
 * Supported event categories:
 *   Contact: Contact.created, Contact.updated, Contact.mapped, Contact.unmapped
 *   Conversation: Conversation.created, Conversation.updated, …
 *   Message: Message.received, Message.WA.status.received, …
 *   Template: Template.status
 *
 * Docs: https://docs.gallabox.com/developer-resources/webhook
 */
import crypto from 'node:crypto'
import type { WebhookEvent } from '../../schema/webhook'

export function verifyWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  const sig = headers['x-gallabox-signature']
  if (!sig || !secret) return false
  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex')
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))
  } catch {
    return false
  }
}

/**
 * Map a Gallabox event type string to a canonical action.
 * Gallabox uses dot-notation: "Contact.created", "Contact.updated", etc.
 */
function mapAction(eventType: string): WebhookEvent['action'] {
  const lower = eventType.toLowerCase()
  if (lower.endsWith('.created') || lower.endsWith('.received')) return 'created'
  if (lower.endsWith('.updated') || lower.endsWith('.mapped')) return 'updated'
  if (lower.endsWith('.deleted') || lower.endsWith('.unmapped')) return 'deleted'
  return 'unknown'
}

export function parseWebhookEvents(
  payload: Record<string, unknown>,
): WebhookEvent[] {
  const events = Array.isArray(payload) ? payload : [payload]

  return events.map((event) => {
    const raw = event as Record<string, unknown>
    const eventType = String(raw['type'] ?? raw['event'] ?? 'unknown')
    const resourceId = String(
      raw['id'] ?? raw['contactId'] ?? raw['conversationId'] ?? raw['messageId'] ?? 'unknown',
    )
    const accountId = raw['accountId'] ? String(raw['accountId']) : undefined

    return {
      platform: 'gallabox',
      type: eventType.toLowerCase(),
      resourceType: 'unknown' as WebhookEvent['resourceType'],
      action: mapAction(eventType),
      resourceId,
      tenantId: accountId,
      payload: raw,
    }
  })
}

export const gallaboxWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook,
  parseWebhookEvents,
}
