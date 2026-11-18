/**
 * Unthread webhook verification + parsing.
 *
 * Unthread signs webhook payloads with HMAC-SHA256 over the raw request body.
 * The hex-encoded digest is delivered in the `X-Unthread-Signature` header.
 *
 * Signing secret is available from the Unthread dashboard.
 *
 * Supported event types:
 *   conversation_created | conversation_updated | conversation_deleted | message_created
 *
 * Payload shape:
 *   {
 *     event: string,
 *     eventId: string,
 *     eventTimestamp: number,   // Unix ms
 *     webhookTimestamp: number, // Unix ms
 *     data: { id: string, ... }
 *   }
 *
 * Docs: https://docs.unthread.io/docs/api-docs/webhooks
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type { WebhookAction, WebhookEvent, WebhookResourceType } from '../../schema/webhook'

const SIG_HEADER = 'x-unthread-signature'

export function verifyUnthreadWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    // Header names may arrive in original or lowercase form
    const provided =
      headers[SIG_HEADER] ??
      headers['X-Unthread-Signature']
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

const ACTION_MAP: Record<string, { resourceType: WebhookResourceType; action: WebhookAction }> = {
  conversation_created: { resourceType: 'tickets', action: 'created' },
  conversation_updated: { resourceType: 'tickets', action: 'updated' },
  conversation_deleted: { resourceType: 'tickets', action: 'deleted' },
  message_created: { resourceType: 'messages', action: 'commented' },
}

export function parseUnthreadWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const event = String(payload['event'] ?? '')
  const eventId = String(payload['eventId'] ?? '')
  const data = (payload['data'] as Record<string, unknown> | undefined) ?? {}
  const resourceId = String(data['id'] ?? '')
  const mapped = ACTION_MAP[event] ?? {
    resourceType: 'unknown' as WebhookResourceType,
    action: 'unknown' as WebhookAction,
  }

  return [
    {
      id: eventId || `unthread:${event}:${resourceId}`,
      platform: 'unthread',
      type: event,
      resourceType: mapped.resourceType,
      action: mapped.action,
      resourceId,
      ticketId: mapped.resourceType === 'messages' ? String(data['conversationId'] ?? '') : undefined,
      payload,
    },
  ]
}

export const UnthreadWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyUnthreadWebhook,
  parseWebhookEvents: parseUnthreadWebhookEvents,
}
