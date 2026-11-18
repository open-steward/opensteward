import crypto from 'node:crypto'
import type { WebhookEvent } from '../../schema/webhook'

/**
 * Verify a Kommo webhook request.
 *
 * Kommo signs the raw body with HMAC-SHA1 using the client secret and sends
 * the hex digest in the `X-Signature` header.
 */
export function verifyKommoWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  const sig = headers['x-signature'] ?? headers['X-Signature'] ?? ''
  if (!sig) return false
  const expected = crypto.createHmac('sha1', secret).update(payload).digest('hex')
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  } catch {
    return false
  }
}

/**
 * Parse incoming Kommo webhook payload into canonical WebhookEvents.
 *
 * Kommo sends a body like:
 * ```json
 * {
 *   "contacts": { "add": [{ "id": 123 }] },
 *   "leads": { "update": [{ "id": 456 }] }
 * }
 * ```
 */
export function parseKommoWebhookEvents(
  payload: Record<string, unknown>,
): WebhookEvent[] {
  const events: WebhookEvent[] = []

  const resourceKeys = ['contacts', 'leads'] as const

  const actionMap: Record<string, WebhookEvent['action']> = {
    add: 'created',
    update: 'updated',
    delete: 'deleted',
  }

  for (const resourceKey of resourceKeys) {
    const resourcePayload = payload[resourceKey] as Record<string, unknown[]> | undefined
    if (!resourcePayload) continue

    for (const [actionKey, canonicalAction] of Object.entries(actionMap)) {
      const items = resourcePayload[actionKey] as Array<Record<string, unknown>> | undefined
      if (!items) continue

      for (const item of items) {
        events.push({
          platform: 'kommo',
          type: `${resourceKey}.${actionKey}`,
          resourceType: 'unknown',
          action: canonicalAction,
          resourceId: String(item['id'] ?? 'unknown'),
          payload: item,
        })
      }
    }
  }

  return events
}

export const kommoWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook: verifyKommoWebhook,
  parseWebhookEvents: parseKommoWebhookEvents,
}
