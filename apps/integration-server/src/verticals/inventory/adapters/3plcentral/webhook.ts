/**
 * 3PL Central (Extensiv Warehouse Manager) webhook verification and event parsing.
 *
 * Signing: RSA-SHA256. The platform signs the message body with an internal RSA
 * private key. The signature arrives base64-encoded in the "Signature" header.
 * The public key can be fetched from:
 *   GET https://secure-wms.com/events/webhook/key
 *
 * Payload shape:
 *   { tplId, wmsEventId, dateTime, eventDateTimeUtc, eventType (string),
 *     resource: { rel, href, body? }, links, data, tags }
 *
 * Event types (EventType enum, string form):
 *   OrderConfirm, OrderCreate, OrderCancel, OrderUpdate,
 *   ReceiptCreate, ReceiptConfirm, ReceiptCancel, ReceiptUpdate,
 *   AdjustmentCreate, AdjustmentConfirm, AdjustmentCancel, AdjustmentUpdate,
 *   ItemCreate, ItemUpdate, ItemDelete,
 *   InventorySummaryUpdate, AssemblyCreate, AssemblyConfirm, ...
 */
import { createVerify } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type { WebhookAction, WebhookEvent, WebhookResourceType } from '../../schema/webhook'

const SIG_HEADER = 'Signature'

/**
 * Verify a 3PL Central webhook using RSA-SHA256.
 *
 * @param payload  Raw request body buffer
 * @param headers  Request headers (case-insensitive lookup attempted)
 * @param secret   PEM-encoded RSA public key (obtained from
 *                 GET https://secure-wms.com/events/webhook/key)
 */
export function verify3plCentralWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const sig =
      headers[SIG_HEADER] ??
      headers[SIG_HEADER.toLowerCase()] ??
      headers['signature']
    if (!sig) return false

    const verify = createVerify('SHA256')
    verify.update(payload)
    return verify.verify(secret, sig, 'base64')
  } catch {
    return false
  }
}

type EventEntry = { resourceType: WebhookResourceType; action: WebhookAction }

const EVENT_MAP: Record<string, EventEntry> = {
  // Items (SKU master)
  ItemCreate:             { resourceType: 'products', action: 'created' },
  ItemUpdate:             { resourceType: 'products', action: 'updated' },
  ItemDelete:             { resourceType: 'products', action: 'deleted' },

  // Receipts / inbound (mapped to purchase-orders)
  ReceiptCreate:          { resourceType: 'purchase-orders', action: 'created' },
  ReceiptUpdate:          { resourceType: 'purchase-orders', action: 'updated' },
  ReceiptConfirm:         { resourceType: 'purchase-orders', action: 'received' },
  ReceiptCancel:          { resourceType: 'purchase-orders', action: 'updated' },

  // Inventory adjustments
  AdjustmentCreate:       { resourceType: 'stock-adjustments', action: 'adjusted' },
  AdjustmentUpdate:       { resourceType: 'stock-adjustments', action: 'updated' },
  AdjustmentConfirm:      { resourceType: 'stock-adjustments', action: 'adjusted' },
  AdjustmentCancel:       { resourceType: 'stock-adjustments', action: 'updated' },

  // Inventory summary (stock-level snapshot changed)
  InventorySummaryUpdate: { resourceType: 'stock-levels', action: 'updated' },
}

export function parse3plCentralWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const eventType = String(payload['eventType'] ?? '')
  const wmsEventId = String(payload['wmsEventId'] ?? payload['tplId'] ?? '')

  // resource may contain the canonical resource ID (numeric part of href)
  const resource = payload['resource'] as Record<string, unknown> | undefined
  const href = String(resource?.['href'] ?? '')
  // Extract trailing integer from href like .../receivers/12345
  const hrefId = href.split('/').filter(Boolean).pop() ?? ''
  const resourceId = hrefId || wmsEventId

  const mapped: EventEntry = EVENT_MAP[eventType] ?? {
    resourceType: 'unknown' as WebhookResourceType,
    action: 'unknown' as WebhookAction,
  }

  return [
    {
      id: `3plcentral:${eventType}:${resourceId}`,
      platform: '3plcentral',
      type: eventType,
      resourceType: mapped.resourceType,
      action: mapped.action,
      resourceId,
      payload,
    },
  ]
}

export const ThreePlCentralWebhookHandler: WebhookHandler = {
  verifyWebhook: verify3plCentralWebhook,
  parseWebhookEvents: parse3plCentralWebhookEvents,
}
