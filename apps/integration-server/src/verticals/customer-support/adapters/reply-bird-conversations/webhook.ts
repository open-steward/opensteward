/**
 * Bird (CX) webhook verification + event parsing.
 *
 * Bird signs webhooks with HMAC-SHA256. The signed payload is:
 *   {timestamp}\n{url}\n{sha256(body)}
 * where sha256(body) is the RAW BINARY (not hex) SHA-256 digest of the request body.
 *
 * Bird does NOT send the URL as a header — the URL component in the signed string
 * must be reconstructed by the receiver. Within the `verifyWebhook(payload, headers,
 * secret)` interface the full URL is unavailable, so we use an empty string for the
 * URL component (consistent with how Bird's own SDK handles server-side verification
 * when the URL is not forwarded).
 *
 * Headers:
 *   messagebird-signature          — base64-encoded HMAC-SHA256 signature
 *   messagebird-request-timestamp  — Unix timestamp string
 *
 * Docs: https://docs.bird.com/api/notifications-api/api-reference/webhook-subscriptions/verifying-a-webhook-subscription
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type { WebhookAction, WebhookEvent, WebhookResourceType } from '../../schema/webhook'

const SIG_HEADER = 'messagebird-signature'
const TS_HEADER = 'messagebird-request-timestamp'

function getHeader(headers: Record<string, string>, name: string): string | undefined {
  const lower = name.toLowerCase()
  return (
    headers[name] ??
    headers[lower] ??
    headers[name.toUpperCase()] ??
    Object.entries(headers).find(([k]) => k.toLowerCase() === lower)?.[1]
  )
}

export function verifyBirdWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const timestamp = getHeader(headers, TS_HEADER)
    const providedB64 = getHeader(headers, SIG_HEADER)
    if (!timestamp || !providedB64) return false

    // Bird scheme: HMAC-SHA256( timestamp + "\n" + url + "\n" + sha256(body) )
    // The body hash is RAW BINARY bytes (not hex), concatenated as binary.
    // The URL is not forwarded as a header — use empty string so the signed string
    // is well-defined without requiring knowledge of the inbound request URL.
    // Result: prefix = "timestamp\n\n" (empty URL between the two newlines)
    const bodyHashBytes = createHash('sha256').update(payload).digest()
    const prefix = Buffer.from(`${timestamp}\n\n`, 'utf8')
    const signedBuf = Buffer.concat([prefix, bodyHashBytes])

    const expected = createHmac('sha256', secret).update(signedBuf).digest()
    const provided = Buffer.from(providedB64.trim(), 'base64')
    if (expected.length !== provided.length) return false
    return timingSafeEqual(expected, provided)
  } catch {
    return false
  }
}

const ACTION_MAP: Record<string, { resourceType: WebhookResourceType; action: WebhookAction }> = {
  'conversation.created': { resourceType: 'tickets', action: 'created' },
  'conversation.updated': { resourceType: 'tickets', action: 'updated' },
  'conversation.deleted': { resourceType: 'tickets', action: 'deleted' },
  'message.created': { resourceType: 'messages', action: 'created' },
  'message.updated': { resourceType: 'messages', action: 'updated' },
  'message.delivered': { resourceType: 'messages', action: 'updated' },
}

export function parseBirdWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const type = String(payload['type'] ?? '')
  const data = (payload['data'] as Record<string, unknown> | undefined) ?? payload
  const resourceId = String(data['id'] ?? payload['id'] ?? '')
  const conversationId = String(
    (data['conversationId'] as string | undefined) ??
    (payload['conversationId'] as string | undefined) ??
    '',
  )

  const mapped = ACTION_MAP[type] ?? {
    resourceType: 'unknown' as WebhookResourceType,
    action: 'unknown' as WebhookAction,
  }

  return [
    {
      id: `bird:${type}:${resourceId}`,
      platform: 'reply-bird-conversations',
      type,
      resourceType: mapped.resourceType,
      action: mapped.action,
      resourceId,
      ticketId: mapped.resourceType === 'messages' ? conversationId : undefined,
      payload,
    },
  ]
}

export const BirdWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyBirdWebhook,
  parseWebhookEvents: parseBirdWebhookEvents,
}
