import { verifyHmacSha256 } from '@opensteward/shared'
import type { WebhookEvent } from '../../schema/webhook'

/**
 * Verify an Attio webhook payload.
 * Attio signs requests with X-Attio-Signature (HMAC-SHA256 hex of raw body).
 */
export function verifyWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  return verifyHmacSha256(payload, secret, headers['x-attio-signature'] ?? '', 'hex')
}

/**
 * Map Attio webhook payload to canonical WebhookEvent[].
 *
 * Attio event_type examples:
 *   record.created, record.updated, record.deleted
 * Combined with object_slug (people, companies, deals) to derive resourceType.
 */
export function parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const eventType = String(payload['event_type'] ?? 'unknown')
  const objectSlug = String(payload['object_slug'] ?? 'unknown')
  const recordId = String(
    (payload['record'] as Record<string, unknown> | undefined)?.['id'] ?? 'unknown',
  )

  // Derive action from event_type suffix
  let action: WebhookEvent['action'] = 'unknown'
  if (eventType.endsWith('.created')) action = 'created'
  else if (eventType.endsWith('.updated')) action = 'updated'
  else if (eventType.endsWith('.deleted')) action = 'deleted'

  return [
    {
      platform: 'attio',
      type: `${objectSlug}.${action}`,
      resourceType: 'unknown',
      action,
      resourceId: recordId,
      payload,
    },
  ]
}

export const attioWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook: verifyWebhook,
  parseWebhookEvents: parseWebhookEvents,
}
