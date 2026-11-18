/**
 * Follow Up Boss webhook helpers.
 *
 * Signature verification:
 *   FUB passes a `FUB-Signature` header with each webhook request.
 *   To verify: base64-encode the raw JSON payload (non-prettified),
 *   then HMAC-SHA256 that base64-encoded value using the shared webhook
 *   secret (the X-System-Key you received when registering your system
 *   integration with Follow Up Boss). That hex digest must match the
 *   FUB-Signature header value.
 *
 *   The `secret` argument to verifyWebhook is the X-System-Key — it is
 *   NOT a separate request header. It is the HMAC key used for signature
 *   computation only.
 *
 * Webhook event types (examples):
 *   peopleCreated, peopleUpdated, peopleDeleted
 *   dealsCreated, dealsUpdated, dealsDeleted
 *   notesCreated, notesUpdated, notesDeleted
 */
import crypto from 'node:crypto'
import type { WebhookEvent } from '../../schema/webhook'

export function verifyWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  const signature = headers['fub-signature'] ?? headers['FUB-Signature']
  if (!signature || !secret) return false

  try {
    const base64Payload = payload.toString('base64')
    const expected = crypto
      .createHmac('sha256', secret)
      .update(base64Payload)
      .digest('hex')
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  } catch {
    return false
  }
}

/**
 * Parse a Follow Up Boss webhook payload into canonical WebhookEvent(s).
 *
 * FUB delivers a single event object (not an array) per request.
 * The `type` field contains the event name, e.g. "peopleCreated".
 * The resource object (person/deal/note) is nested under its type key.
 */
export function parseWebhookEvents(
  payload: Record<string, unknown>,
): WebhookEvent[] {
  const eventType = String(payload['type'] ?? 'unknown')

  // Derive canonical resource type and action from the FUB event name.
  // e.g. "peopleCreated" -> action="created", "dealsUpdated" -> action="updated"
  let action: WebhookEvent['action'] = 'unknown'
  if (eventType.endsWith('Created')) action = 'created'
  else if (eventType.endsWith('Updated')) action = 'updated'
  else if (eventType.endsWith('Deleted')) action = 'deleted'

  // Extract the resource id — try common locations in the payload.
  const data = (payload['data'] ?? payload['person'] ?? payload['deal'] ?? payload) as Record<string, unknown>
  const resourceId = String(data['id'] ?? payload['id'] ?? 'unknown')

  return [
    {
      platform: 'follow-up-boss',
      type: eventType,
      resourceType: 'unknown',
      action,
      resourceId,
      payload,
    },
  ]
}

export const followUpBossWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook,
  parseWebhookEvents,
}
