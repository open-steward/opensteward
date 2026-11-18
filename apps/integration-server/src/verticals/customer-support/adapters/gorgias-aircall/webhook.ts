/**
 * Pylon webhook verification + parsing.
 *
 * Pylon signs webhooks with HMAC-SHA256. Signature is delivered in
 * `Pylon-Webhook-Signature` as `hs256=<hex-digest>`. The signed payload
 * is `concat(timestamp, '.', body)` where timestamp comes from the
 * `Pylon-Webhook-Timestamp` header (Unix epoch string).
 *
 * Docs: https://getpylon.com/developers/guides/using-webhooks/
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type { WebhookAction, WebhookEvent, WebhookResourceType } from '../../schema/webhook'

const SIG_HEADER = 'pylon-webhook-signature'
const TS_HEADER = 'pylon-webhook-timestamp'

function resolveHeader(headers: Record<string, string>, name: string): string | undefined {
  return headers[name] ?? headers[name.toLowerCase()] ?? undefined
}

export function verifyPylonWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const timestamp = resolveHeader(headers, TS_HEADER) ?? resolveHeader(headers, 'Pylon-Webhook-Timestamp')
    const provided = resolveHeader(headers, SIG_HEADER) ?? resolveHeader(headers, 'Pylon-Webhook-Signature')
    if (!timestamp || !provided) return false
    // Strip the "hs256=" prefix if present
    const signature = provided.startsWith('hs256=') ? provided.slice(6) : provided
    // Signed payload: timestamp + '.' + body
    const signedPayload = `${timestamp}.${payload.toString('utf8')}`
    const expected = createHmac('sha256', secret).update(signedPayload).digest('hex')
    const a = Buffer.from(expected, 'utf8')
    const b = Buffer.from(signature.trim(), 'utf8')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

// Pylon event type → canonical resource + action
// Pylon webhook event types are not fully enumerated in public docs;
// using common patterns observed.
const ACTION_MAP: Record<string, { resourceType: WebhookResourceType; action: WebhookAction }> = {
  'issue.created': { resourceType: 'tickets', action: 'created' },
  'issue.updated': { resourceType: 'tickets', action: 'updated' },
  'issue.closed': { resourceType: 'tickets', action: 'updated' },
  'issue.message.created': { resourceType: 'messages', action: 'commented' },
  'contact.created': { resourceType: 'contacts', action: 'created' },
  'contact.updated': { resourceType: 'contacts', action: 'updated' },
}

export function parsePylonWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const type = String(payload['type'] ?? payload['event_type'] ?? '')
  const data = (payload['data'] as Record<string, unknown> | undefined) ?? payload
  const resourceId = String((data['id'] as string | number | undefined) ?? '')
  const issueId = String((data['issue_id'] as string | number | undefined) ?? resourceId)
  const mapped = ACTION_MAP[type] ?? {
    resourceType: 'unknown' as WebhookResourceType,
    action: 'unknown' as WebhookAction,
  }
  return [
    {
      id: `pylon:${type}:${resourceId}`,
      platform: 'gorgias-aircall',
      type,
      resourceType: mapped.resourceType,
      action: mapped.action,
      resourceId,
      ticketId: mapped.resourceType === 'messages' ? issueId : undefined,
      payload,
    },
  ]
}

export const PylonWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyPylonWebhook,
  parseWebhookEvents: parsePylonWebhookEvents,
}

