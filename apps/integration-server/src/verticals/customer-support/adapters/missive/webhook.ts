/**
 * Missive webhook verification + parsing.
 *
 * Missive signs webhooks with HMAC-SHA256 over the raw request body.
 * The signature is delivered in the `X-Hook-Signature` header as:
 *   "sha256=<hex_digest>"
 *
 * Docs: https://missiveapp.com/docs/developers/webhooks
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type { WebhookAction, WebhookEvent, WebhookResourceType } from '../../schema/webhook'

const SIG_HEADER = 'x-hook-signature'

export function verifyMissiveWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    // Header lookup is case-insensitive
    const rawSig =
      headers[SIG_HEADER] ??
      headers['X-Hook-Signature'] ??
      headers[SIG_HEADER.toLowerCase()]
    if (!rawSig) return false

    // Expected format: "sha256=<hex>"
    const prefix = 'sha256='
    if (!rawSig.startsWith(prefix)) return false
    const provided = rawSig.slice(prefix.length)

    const expected = createHmac('sha256', secret).update(payload).digest('hex')
    const a = Buffer.from(expected, 'utf8')
    const b = Buffer.from(provided.trim(), 'utf8')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

/** Missive rule.type → canonical resource + action mapping. */
const ACTION_MAP: Record<string, { resourceType: WebhookResourceType; action: WebhookAction }> = {
  label_change:        { resourceType: 'tickets', action: 'updated' },
  conversation_opened: { resourceType: 'tickets', action: 'created' },
  conversation_closed: { resourceType: 'tickets', action: 'updated' },
  new_comment:         { resourceType: 'messages', action: 'commented' },
  new_message:         { resourceType: 'messages', action: 'created' },
  new_email:           { resourceType: 'messages', action: 'created' },
}

export function parseMissiveWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const rule = (payload['rule'] as Record<string, unknown> | undefined) ?? {}
  const type = String(rule['type'] ?? payload['type'] ?? '')

  const conversation = (payload['conversation'] as Record<string, unknown> | undefined) ?? {}
  const conversationId = String(conversation['id'] ?? '')

  const latestMessage = (payload['latest_message'] as Record<string, unknown> | undefined) ?? {}
  const messageId = String(latestMessage['id'] ?? '')

  const mapped = ACTION_MAP[type] ?? {
    resourceType: 'unknown' as WebhookResourceType,
    action: 'unknown' as WebhookAction,
  }

  const isMessage = mapped.resourceType === 'messages'
  const resourceId = isMessage && messageId ? messageId : conversationId

  return [
    {
      id: `missive:${type}:${resourceId}`,
      platform: 'missive',
      type,
      resourceType: mapped.resourceType,
      action: mapped.action,
      resourceId,
      ticketId: isMessage && conversationId ? conversationId : undefined,
      payload,
    },
  ]
}

export const MissiveWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyMissiveWebhook,
  parseWebhookEvents: parseMissiveWebhookEvents,
}
