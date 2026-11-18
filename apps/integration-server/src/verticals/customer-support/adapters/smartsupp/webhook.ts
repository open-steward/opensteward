/**
 * Smartsupp webhook verification + event parsing.
 *
 * Smartsupp signs webhooks with HMAC-SHA256 over the raw request body,
 * delivering the hex-encoded digest in the `X-Smartsupp-Hmac` header.
 *
 * Verification (Node.js example from Smartsupp docs):
 *   createHmac('sha256', secret).update(body).digest('hex')
 *
 * Payload envelope:
 *   {
 *     type:       "event_callback",
 *     event:      "conversation.closed" | "conversation.opened" | ...,
 *     timestamp:  "<ISO 8601>",
 *     account_id: "<string>",
 *     app_id:     "<string>",
 *     data:       { ... }
 *   }
 *
 * Docs: https://docs.smartsupp.com/rest-api/webhooks/
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type { WebhookAction, WebhookEvent, WebhookResourceType } from '../../schema/webhook'

const HMAC_HEADER = 'x-smartsupp-hmac'

export function verifySmartsuppWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    // Header names may be in any case — normalise to lowercase for lookup
    const provided = Object.entries(headers)
      .find(([k]) => k.toLowerCase() === HMAC_HEADER)?.[1]
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
 * Event name → canonical resource type + action mapping.
 * Smartsupp docs list event types as "conversation.*" and "message.*".
 */
const ACTION_MAP: Record<string, { resourceType: WebhookResourceType; action: WebhookAction }> = {
  'conversation.created':   { resourceType: 'tickets',  action: 'created' },
  'conversation.opened':    { resourceType: 'tickets',  action: 'reopened' },
  'conversation.closed':    { resourceType: 'tickets',  action: 'closed' },
  'conversation.assigned':  { resourceType: 'tickets',  action: 'assigned' },
  'conversation.unassigned':{ resourceType: 'tickets',  action: 'unassigned' },
  'conversation.rated':     { resourceType: 'tickets',  action: 'rated' },
  'message.created':        { resourceType: 'messages', action: 'commented' },
  'contact.created':        { resourceType: 'contacts', action: 'created' },
  'contact.updated':        { resourceType: 'contacts', action: 'updated' },
}

export function parseSmartsuppWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const event = String(payload['event'] ?? '')
  const data = (payload['data'] as Record<string, unknown> | undefined) ?? {}
  const resourceId = String(data['id'] ?? data['conversation_id'] ?? '')
  const mapped = ACTION_MAP[event] ?? {
    resourceType: 'unknown' as WebhookResourceType,
    action: 'unknown' as WebhookAction,
  }
  return [
    {
      id: `smartsupp:${event}:${resourceId}`,
      platform: 'smartsupp',
      type: event,
      resourceType: mapped.resourceType,
      action: mapped.action,
      resourceId,
      ticketId: mapped.resourceType === 'messages' ? String(data['conversation_id'] ?? '') : undefined,
      payload,
    },
  ]
}

export const SmartsuppWebhookHandler: WebhookHandler = {
  verifyWebhook: verifySmartsuppWebhook,
  parseWebhookEvents: parseSmartsuppWebhookEvents,
}
