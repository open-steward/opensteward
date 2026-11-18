import crypto from 'node:crypto'
import type { WebhookEvent } from '../../schema/webhook'

/**
 * Verify a Zoho CRM webhook request.
 *
 * Zoho sends an HMAC-SHA256 signature in the `X-Zoho-CRM-Signature` header
 * computed over the raw request body using the webhook token as the key.
 */
export function verifyZohoCrmWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  const signature = headers['x-zoho-crm-signature']
  if (!signature) return false

  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex')

  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  } catch {
    return false
  }
}

/**
 * Parse Zoho CRM webhook events.
 *
 * Zoho webhook payloads include a `module` field (e.g. "Contacts") and an
 * `operation` field (e.g. "insert", "update", "delete").
 */
export function parseZohoCrmWebhookEvents(
  payload: Record<string, unknown>,
): WebhookEvent[] {
  const module = String(payload['module'] ?? 'unknown').toLowerCase()
  const operation = String(payload['operation'] ?? 'unknown').toLowerCase()
  const ids = Array.isArray(payload['ids']) ? payload['ids'] as string[] : []
  const resourceId = ids[0] != null ? String(ids[0]) : 'unknown'

  return [{
    platform: 'zoho-crm',
    type: `${module}.${operation}`,
    resourceType: 'unknown' as WebhookEvent['resourceType'],
    action: mapAction(operation),
    resourceId,
    payload,
  }]

  function mapAction(op: string): WebhookEvent['action'] {
    if (op === 'insert') return 'created'
    if (op === 'update') return 'updated'
    if (op === 'delete') return 'deleted'
    return 'unknown'
  }
}

export const zohoCrmWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook: verifyZohoCrmWebhook,
  parseWebhookEvents: parseZohoCrmWebhookEvents,
}
