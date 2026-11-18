import { createHmac, timingSafeEqual } from 'crypto'
import type { WebhookEvent } from '../../schema/webhook'

/**
 * Terminal Africa signs webhooks with HMAC-SHA512.
 * The digest is hex-encoded and sent in the `X-Terminal-Signature` header.
 * The body must be JSON.stringify'd before hashing.
 */
function verifyWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  const signature = headers['x-terminal-signature'] ?? ''
  const expected = createHmac('sha512', secret)
    .update(payload.toString('utf8'))
    .digest('hex')
  try {
    return timingSafeEqual(
      Buffer.from(signature, 'utf8'),
      Buffer.from(expected, 'utf8'),
    )
  } catch {
    return false
  }
}

function parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const eventType = String(payload['event'] ?? '')
  const data = payload['data'] as Record<string, unknown> | undefined

  // eventType examples: "shipment.created", "shipment.updated", "shipment.cancelled",
  //                     "shipment.in-transit", "shipment.delivered",
  //                     "address.created", "address.updated", "address.deleted",
  //                     "transaction.success", "transaction.failed"

  const [resource, rawAction] = eventType.split('.')

  type CanonicalResource = WebhookEvent['resourceType']
  const resourceTypeMap: Record<string, CanonicalResource> = {
    shipment: 'shipment',
    address: 'shipment',
    transaction: 'shipment',
    insurance: 'shipment',
    claim: 'shipment',
    packaging: 'shipment',
    reconciliation: 'shipment',
  }

  const resourceType = resourceTypeMap[resource]
  if (!resourceType) return []

  type CanonicalAction = WebhookEvent['action']
  const actionMap: Record<string, CanonicalAction> = {
    created: 'created',
    updated: 'updated',
    deleted: 'deleted',
    cancelled: 'cancelled',
    canceled: 'cancelled',
    success: 'updated',
    failed: 'updated',
    'in-transit': 'updated',
    delivered: 'updated',
    flagged: 'updated',
    billed: 'updated',
  }

  const action: CanonicalAction = actionMap[rawAction ?? ''] ?? 'updated'

  const resourceId =
    data
      ? (String(data['shipment_id'] ?? data['id'] ?? data['address_id'] ?? '') || undefined)
      : undefined

  return [
    {
      platform: 'terminal-africa',
      type: eventType,
      resourceType,
      action,
      resourceId,
      payload,
    },
  ]
}

export const terminalAfricaWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook,
  parseWebhookEvents,
}
