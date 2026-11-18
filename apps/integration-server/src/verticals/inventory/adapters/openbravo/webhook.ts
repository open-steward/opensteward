/**
 * Openbravo webhook stub.
 *
 * Openbravo ERP does not publish a documented HMAC/JWT webhook signing
 * mechanism for its JSON REST Web Services (as of the current public
 * documentation). Inbound event notifications are typically handled via
 * process triggers and custom modules rather than a standardised push
 * webhook protocol.
 *
 * verifyWebhook therefore always returns false (safe default).
 * parseWebhookEvents extracts a best-effort event from whatever payload
 * structure is passed in case a custom integration delivers events.
 */
import type { WebhookHandler } from '@opensteward/shared'
import type { WebhookEvent, WebhookResourceType, WebhookAction } from '../../schema/webhook'

export function verifyOpenbravoWebhook(
  _payload: Buffer,
  _headers: Record<string, string>,
  _secret: string,
): boolean {
  // No signing scheme is documented — reject all by default.
  return false
}

const EVENT_MAP: Record<string, { resourceType: WebhookResourceType; action: WebhookAction }> = {
  'product.created': { resourceType: 'products', action: 'created' },
  'product.updated': { resourceType: 'products', action: 'updated' },
  'stock.updated': { resourceType: 'stock-levels', action: 'updated' },
  'order.created': { resourceType: 'purchase-orders', action: 'created' },
  'order.completed': { resourceType: 'purchase-orders', action: 'received' },
  'inventory.processed': { resourceType: 'stock-adjustments', action: 'adjusted' },
  'movement.completed': { resourceType: 'stock-transfers', action: 'transferred' },
}

export function parseOpenbravoWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const eventType = String(payload['eventType'] ?? payload['type'] ?? payload['event'] ?? '')
  const id = String(
    (payload['data'] as Record<string, unknown> | undefined)?.['id'] ??
      payload['id'] ??
      '',
  )
  const mapped = EVENT_MAP[eventType.toLowerCase()] ?? {
    resourceType: 'unknown' as WebhookResourceType,
    action: 'unknown' as WebhookAction,
  }
  return [
    {
      id: `openbravo:${eventType}:${id}`,
      platform: 'openbravo',
      type: eventType,
      resourceType: mapped.resourceType,
      action: mapped.action,
      resourceId: id,
      payload,
    },
  ]
}

export const OpenbravoWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyOpenbravoWebhook,
  parseWebhookEvents: parseOpenbravoWebhookEvents,
}
