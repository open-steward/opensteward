/**
 * Intercom webhook verification + parsing, per the Webhook Models reference
 * (fetched 2026-09-28):
 * https://developers.intercom.com/docs/references/webhooks/webhook-models
 *
 * "Intercom signs webhook notifications via an X-Hub-Signature header. ... We
 * compute the value of this X-Hub-Signature header by creating a signature
 * using the body of the JSON request and your App's client_secret value ...
 * The signature is the hexadecimal (40-byte) representation of an SHA-1
 * signature computed using the HMAC algorithm defined in RFC2104. The
 * X-Hub-Signature header value starts with the string sha1= followed by the
 * signature."
 *
 * So the `secret` configured for this platform's webhooks must be the app's
 * OAuth client secret. There is no timestamp header, so no replay window can
 * be checked; duplicates are expected ("you may receive duplicate
 * notifications"), and the notification `id` is the dedupe key.
 *
 * The notification envelope is `{ type: 'notification_event', id, topic,
 * app_id, data: { type: 'notification_event_data', item } }`, with `item`
 * the object the topic is about.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type { WebhookAction, WebhookEvent, WebhookResourceType } from '../../schema/webhook'

function header(headers: Record<string, string>, name: string): string | undefined {
  const want = name.toLowerCase()
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === want && typeof v === 'string') return v
  }
  return undefined
}

export function verifyIntercomWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    if (!secret) return false
    const provided = header(headers, 'x-hub-signature')?.trim()
    if (!provided || !provided.startsWith('sha1=')) return false
    const got = provided.slice('sha1='.length).toLowerCase()
    const expected = createHmac('sha1', secret).update(payload).digest('hex')
    const a = Buffer.from(expected, 'utf8')
    const b = Buffer.from(got, 'utf8')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

type Mapped = { resourceType: WebhookResourceType; action: WebhookAction }

/** Topics from the Webhook Models reference; anything else parses as unknown/unknown. */
const TOPIC_MAP: Record<string, Mapped> = {
  'conversation.user.created': { resourceType: 'tickets', action: 'created' },
  'conversation.admin.single.created': { resourceType: 'tickets', action: 'created' },
  'conversation.admin.assigned': { resourceType: 'tickets', action: 'assigned' },
  'conversation.admin.open.assigned': { resourceType: 'tickets', action: 'assigned' },
  'conversation.admin.closed': { resourceType: 'tickets', action: 'closed' },
  'conversation.admin.opened': { resourceType: 'tickets', action: 'reopened' },
  'conversation.admin.snoozed': { resourceType: 'tickets', action: 'updated' },
  'conversation.admin.unsnoozed': { resourceType: 'tickets', action: 'updated' },
  'conversation.priority.updated': { resourceType: 'tickets', action: 'updated' },
  'conversation.rating.added': { resourceType: 'tickets', action: 'rated' },
  'conversation.deleted': { resourceType: 'tickets', action: 'deleted' },
  'conversation.user.replied': { resourceType: 'messages', action: 'commented' },
  'conversation.admin.replied': { resourceType: 'messages', action: 'commented' },
  'conversation.operator.replied': { resourceType: 'messages', action: 'commented' },
  'conversation.admin.noted': { resourceType: 'messages', action: 'commented' },
  'contact.user.created': { resourceType: 'contacts', action: 'created' },
  'contact.lead.created': { resourceType: 'contacts', action: 'created' },
  'contact.user.updated': { resourceType: 'contacts', action: 'updated' },
  'contact.lead.updated': { resourceType: 'contacts', action: 'updated' },
  'contact.deleted': { resourceType: 'contacts', action: 'deleted' },
}

const UNKNOWN: Mapped = { resourceType: 'unknown', action: 'unknown' }

export function parseIntercomWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const topic = typeof payload['topic'] === 'string' ? payload['topic'] : ''
  const data = (payload['data'] as Record<string, unknown> | undefined) ?? {}
  const item = (data['item'] as Record<string, unknown> | undefined) ?? {}
  const itemId = item['id'] == null ? '' : String(item['id'])
  const mapped = TOPIC_MAP[topic] ?? UNKNOWN
  const notifId = payload['id'] == null ? undefined : String(payload['id'])
  return [
    {
      id: notifId ?? `intercom:${topic}:${itemId}`,
      platform: 'intercom',
      type: topic,
      resourceType: mapped.resourceType,
      action: mapped.action,
      resourceId: itemId,
      // A conversation.* message topic carries the conversation as its item.
      ticketId: mapped.resourceType === 'messages' ? itemId : undefined,
      payload,
    },
  ]
}

export const IntercomWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyIntercomWebhook,
  parseWebhookEvents: parseIntercomWebhookEvents,
}
