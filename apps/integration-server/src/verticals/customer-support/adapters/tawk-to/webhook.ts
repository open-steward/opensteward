/**
 * tawk.to webhook verification + parsing.
 *
 * tawk.to signs webhook payloads with HMAC-SHA1 using the webhook secret key.
 * The signature is delivered in the `X-Tawk-Signature` header as a hex digest.
 * Each request also includes `X-Hook-Event-Id` for idempotency.
 *
 * Docs: https://developer.tawk.to/webhooks/
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookAction, WebhookEvent, WebhookResourceType } from '../../schema/webhook'

const SIG_HEADER = 'x-tawk-signature'

export function verifyTawkToWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const provided = headers[SIG_HEADER] ?? headers['X-Tawk-Signature']
    if (!provided) return false
    const expected = createHmac('sha1', secret).update(payload).digest('hex')
    const a = Buffer.from(expected, 'utf8')
    const b = Buffer.from(provided.trim(), 'utf8')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

const ACTION_MAP: Record<string, { resourceType: WebhookResourceType; action: WebhookAction }> = {
  'chat:start':               { resourceType: 'tickets', action: 'created' },
  'chat:end':                 { resourceType: 'tickets', action: 'updated' },
  'chat:transcript_created':  { resourceType: 'messages', action: 'commented' },
  'ticket:create':            { resourceType: 'tickets', action: 'created' },
}

export function parseTawkToWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const event = String(payload['event'] ?? '')
  const mapped = ACTION_MAP[event] ?? {
    resourceType: 'unknown' as WebhookResourceType,
    action: 'unknown' as WebhookAction,
  }

  // Extract resource ID depending on event type
  let resourceId = ''
  let ticketId: string | undefined
  if (event.startsWith('chat:')) {
    resourceId = String(payload['chatId'] ?? '')
    if (mapped.resourceType === 'messages') ticketId = resourceId
  } else if (event === 'ticket:create') {
    const ticket = (payload['ticket'] as Record<string, unknown> | undefined) ?? {}
    resourceId = String(ticket['id'] ?? ticket['humanId'] ?? '')
  }

  const hookEventId = String(payload['hookEventId'] ?? '')

  return [
    {
      id: hookEventId || `tawk-to:${event}:${resourceId}`,
      platform: 'tawk-to',
      type: event,
      resourceType: mapped.resourceType,
      action: mapped.action,
      resourceId,
      ticketId,
      payload,
    },
  ]
}

export const tawkToWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook: verifyTawkToWebhook,
  parseWebhookEvents: parseTawkToWebhookEvents,
}
