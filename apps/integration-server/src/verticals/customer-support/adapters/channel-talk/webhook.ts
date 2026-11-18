/**
 * Channel Talk webhook event parsing.
 *
 * Channel Talk webhooks deliver a JSON body with the shape:
 *   {
 *     "event":  "push" | "update" | "upsert",
 *     "type":   "Message" | "UserChat" | "User",
 *     "entity": { ... },   // the resource object
 *     "refers": { ... }    // related objects (optional)
 *   }
 *
 * Signature verification: Channel Talk's public Open API documentation does
 * not describe a webhook-signing mechanism (no HMAC header), so
 * verifyWebhook always returns true (rely on network-level security /
 * allowlisting instead).
 *
 * Docs: https://developers.channel.io/en/articles/Webhook-events-7bd9b8e2
 */
import type { WebhookHandler } from '@opensteward/shared'
import type { WebhookAction, WebhookEvent, WebhookResourceType } from '../../schema/webhook'

/** Channel Talk does not provide a public webhook signature scheme. */
export function verifyChannelTalkWebhook(
  _payload: Buffer,
  _headers: Record<string, string>,
  _secret: string,
): boolean {
  return true
}

const TYPE_MAP: Record<string, { resourceType: WebhookResourceType; action: WebhookAction }> = {
  // type=Message
  'Message:push': { resourceType: 'messages', action: 'created' },
  // type=UserChat
  'UserChat:update': { resourceType: 'tickets', action: 'updated' },
  'UserChat:push': { resourceType: 'tickets', action: 'created' },
  // type=User
  'User:upsert': { resourceType: 'contacts', action: 'updated' },
}

export function parseChannelTalkWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const event = String(payload['event'] ?? '')
  const type = String(payload['type'] ?? '')
  const entity = (payload['entity'] as Record<string, unknown> | undefined) ?? {}
  const entityId = String(entity['id'] ?? '')
  const chatId = String(entity['chatId'] ?? entity['id'] ?? '')

  const key = `${type}:${event}`
  const mapped = TYPE_MAP[key] ?? {
    resourceType: 'unknown' as WebhookResourceType,
    action: 'unknown' as WebhookAction,
  }

  return [
    {
      id: `channel-talk:${key}:${entityId}`,
      platform: 'channel-talk',
      type: key,
      resourceType: mapped.resourceType,
      action: mapped.action,
      resourceId: entityId,
      ticketId: mapped.resourceType === 'messages' ? chatId : undefined,
      payload,
    },
  ]
}

export const ChannelTalkWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyChannelTalkWebhook,
  parseWebhookEvents: parseChannelTalkWebhookEvents,
}
