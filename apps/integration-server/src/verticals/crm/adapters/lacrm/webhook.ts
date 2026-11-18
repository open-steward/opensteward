import crypto from 'node:crypto'
import type { WebhookEvent } from '../../schema/webhook'

/**
 * Verify a Less Annoying CRM webhook using HMAC-SHA256.
 * LACRM sends the signature in the `x-lacrm-signature` header.
 */
export function verifyWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  const signature = headers['x-lacrm-signature'] ?? headers['X-Lacrm-Signature']
  if (!signature) return false
  const hash = crypto.createHmac('sha256', secret).update(payload).digest('hex')
  try {
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signature))
  } catch {
    return false
  }
}

/**
 * Parse a LACRM webhook payload into canonical WebhookEvent(s).
 * LACRM webhook format is not publicly documented; we extract best-effort fields.
 */
export function parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const event = String(payload['Event'] ?? payload['event'] ?? 'unknown')
  const resourceId = String(
    payload['ContactId'] ??
      payload['PipelineItemId'] ??
      payload['NoteId'] ??
      'unknown',
  )

  let action: WebhookEvent['action'] = 'unknown'
  if (event.toLowerCase().includes('creat')) action = 'created'
  else if (event.toLowerCase().includes('updat') || event.toLowerCase().includes('edit')) action = 'updated'
  else if (event.toLowerCase().includes('delet')) action = 'deleted'

  return [
    {
      platform: 'lacrm',
      type: event,
      resourceType: 'unknown',
      action,
      resourceId,
      payload,
    },
  ]
}

export const lacrmWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook: verifyWebhook,
  parseWebhookEvents: parseWebhookEvents,
}
