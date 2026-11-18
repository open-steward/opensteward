/**
 * Cognigy Live Agent (Chatwoot) webhook verification + parsing.
 *
 * Chatwoot signs every outgoing webhook with HMAC-SHA256 using the formula:
 *   sha256=HMAC-SHA256(webhook_secret, "{timestamp}.{raw_body}")
 *
 * Headers delivered on each request:
 *   X-Chatwoot-Signature  — "sha256=<hex_digest>"
 *   X-Chatwoot-Timestamp  — Unix timestamp in seconds (string)
 *   X-Chatwoot-Delivery   — unique delivery ID (unused for verification)
 *
 * Docs: https://www.chatwoot.com/hc/user-guide/articles/1677693021-how-to-use-webhooks
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type { WebhookAction, WebhookEvent, WebhookResourceType } from '../../schema/webhook'

const SIG_HEADER = 'x-chatwoot-signature'
const TS_HEADER = 'x-chatwoot-timestamp'

function getHeader(headers: Record<string, string>, name: string): string | undefined {
  return headers[name] ?? headers[name.toLowerCase()] ?? headers[name.toUpperCase()]
}

export function verifyCognigyWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const timestamp = getHeader(headers, TS_HEADER)
    const provided = getHeader(headers, SIG_HEADER)
    if (!timestamp || !provided) return false
    // signed payload: "{timestamp}.{raw_body}"
    const signedPayload = `${timestamp}.${payload.toString('utf8')}`
    const digest = createHmac('sha256', secret).update(signedPayload).digest('hex')
    const expected = `sha256=${digest}`
    const a = Buffer.from(expected, 'utf8')
    const b = Buffer.from(provided.trim(), 'utf8')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

const ACTION_MAP: Record<string, { resourceType: WebhookResourceType; action: WebhookAction }> = {
  conversation_created:        { resourceType: 'tickets',  action: 'created' },
  conversation_updated:        { resourceType: 'tickets',  action: 'updated' },
  conversation_status_changed: { resourceType: 'tickets',  action: 'updated' },
  message_created:             { resourceType: 'messages', action: 'commented' },
  message_updated:             { resourceType: 'messages', action: 'updated' },
  contact_created:             { resourceType: 'contacts', action: 'created' },
  contact_updated:             { resourceType: 'contacts', action: 'updated' },
}

export function parseCognigyWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const eventType = String(payload['event'] ?? '')
  const conversation = (payload['conversation'] as Record<string, unknown> | undefined) ?? {}
  const message = (payload['message'] as Record<string, unknown> | undefined) ?? {}
  const contact = (payload['contact'] as Record<string, unknown> | undefined) ?? {}

  const mapped = ACTION_MAP[eventType] ?? {
    resourceType: 'unknown' as WebhookResourceType,
    action: 'unknown' as WebhookAction,
  }

  let resourceId: string
  let ticketId: string | undefined

  if (mapped.resourceType === 'tickets') {
    resourceId = String(conversation['id'] ?? payload['id'] ?? '')
  } else if (mapped.resourceType === 'messages') {
    resourceId = String(message['id'] ?? '')
    ticketId = String(
      (message['conversation_id'] as unknown) ??
      (conversation['id'] as unknown) ??
      '',
    )
  } else if (mapped.resourceType === 'contacts') {
    resourceId = String(contact['id'] ?? '')
  } else {
    resourceId = ''
  }

  return [
    {
      id: `cognigy:${eventType}:${resourceId}`,
      platform: 'cognigy',
      type: eventType,
      resourceType: mapped.resourceType,
      action: mapped.action,
      resourceId,
      ticketId,
      payload,
    },
  ]
}

export const CognigyWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyCognigyWebhook,
  parseWebhookEvents: parseCognigyWebhookEvents,
}
