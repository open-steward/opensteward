import { timingSafeEqual } from 'crypto'
import type { WebhookEvent } from '../../schema/webhook'
import type { WebhookHandler } from '@opensteward/shared'

/**
 * Deliveree webhook verification.
 *
 * Each request Deliveree sends includes an `Authorization` header containing
 * the unique webhook key generated when the webhook endpoint is registered.
 * Responding with 401 if the header is incorrect is the recommended pattern.
 *
 * Reference: https://developers.deliveree.com/ — "Webhook" section
 */
export function verifyWebhook(
  _payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  const incoming = (headers['authorization'] ?? headers['Authorization'] ?? '').trim()
  if (!incoming || !secret) return false
  try {
    const a = Buffer.from(incoming, 'utf8')
    const b = Buffer.from(secret.trim(), 'utf8')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export function parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  // Deliveree webhook payloads represent a delivery status update.
  // The top-level object is the delivery with an `id` and `status` field.
  const deliveryId = payload['id'] != null ? String(payload['id']) : undefined
  const status = payload['status'] != null ? String(payload['status']) : undefined

  if (!deliveryId) return []

  const isCancelled = status === 'canceled'

  const action = isCancelled ? 'cancelled' : 'updated'

  return [
    {
      platform: 'deliveree',
      type: `delivery.${status ?? 'updated'}`,
      resourceType: 'shipment',
      action,
      resourceId: deliveryId,
      payload,
    },
  ]
}

export const delivereeWebhook: WebhookHandler = {
  verifyWebhook,
  parseWebhookEvents,
}
