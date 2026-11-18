/**
 * SAP EWM webhook support.
 *
 * SAP S/4HANA and SAP EWM do NOT expose HMAC- or JWT-signed HTTP webhooks
 * directly.  Event delivery is handled through:
 *   - SAP Event Mesh (formerly Enterprise Messaging) — CloudEvents over AMQP/HTTP
 *   - SAP Integration Suite / Cloud Integration
 *   - SOAP callback interfaces (IDocs)
 *
 * CloudEvents payloads from SAP Event Mesh carry a JWT in the Authorization
 * header issued by the XSUAA token service.  Verification requires fetching
 * the JWKS from the XSUAA token endpoint, which is infrastructure-specific and
 * beyond the scope of this static adapter module.
 *
 * Until SAP EWM ships a documented HMAC webhook endpoint this file provides:
 *   - verifyWebhook → always returns false (safe default)
 *   - parseWebhookEvents → parses SAP CloudEvents envelope if present
 */
import type { WebhookHandler } from '@opensteward/shared'
import type { WebhookAction, WebhookEvent, WebhookResourceType } from '../../schema/webhook'

/**
 * SAP does not provide a shared HMAC secret for webhook verification.
 * Always returns false.  Callers should use token introspection via the
 * XSUAA JWKS endpoint for production security.
 */
export function verifySapEwmWebhook(
  _payload: Buffer,
  _headers: Record<string, string>,
  _secret: string,
): boolean {
  return false
}

/**
 * Map SAP CloudEvents type strings to OpenSteward resource / action pairs.
 * SAP publishes events under the type pattern:
 *   sap.s4.beh.<object>.<version>.<action>.v<N>
 * e.g. sap.s4.beh.warehouseorder.v1.Created.v1
 */
const SAP_EVENT_MAP: Record<string, { resourceType: WebhookResourceType; action: WebhookAction }> = {
  'sap.s4.beh.warehouseorder.v1.Created.v1':    { resourceType: 'stock-transfers', action: 'created' },
  'sap.s4.beh.warehouseorder.v1.Completed.v1':  { resourceType: 'stock-transfers', action: 'updated' },
  'sap.s4.beh.warehouseorder.v1.Cancelled.v1':  { resourceType: 'stock-transfers', action: 'updated' },
  'sap.s4.beh.inbounddelivery.v1.Created.v1':   { resourceType: 'purchase-orders', action: 'created' },
  'sap.s4.beh.inbounddelivery.v1.Received.v1':  { resourceType: 'purchase-orders', action: 'received' },
  'sap.s4.beh.physinventory.v1.Posted.v1':      { resourceType: 'stock-adjustments', action: 'adjusted' },
  'sap.s4.beh.product.v1.Changed.v1':           { resourceType: 'products', action: 'updated' },
  'sap.s4.beh.product.v1.Created.v1':           { resourceType: 'products', action: 'created' },
}

export function parseSapEwmWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  // CloudEvents 1.0 envelope
  const type = String(payload['type'] ?? payload['Type'] ?? '')
  const id = String(payload['id'] ?? payload['ID'] ?? '')
  const data = (payload['data'] ?? payload['Data'] ?? {}) as Record<string, unknown>
  const resourceId = String(
    data['InboundDelivery'] ??
    data['PhysicalInventoryDocument'] ??
    data['WarehouseOrder'] ??
    data['Product'] ??
    id,
  )

  const mapped = SAP_EVENT_MAP[type] ?? {
    resourceType: 'unknown' as WebhookResourceType,
    action: 'unknown' as WebhookAction,
  }

  return [
    {
      id: `sap-ewm:${type}:${resourceId}`,
      platform: 'sap-ewm',
      type,
      resourceType: mapped.resourceType,
      action: mapped.action,
      resourceId,
      payload,
    },
  ]
}

export const SapEwmWebhookHandler: WebhookHandler = {
  verifyWebhook: verifySapEwmWebhook,
  parseWebhookEvents: parseSapEwmWebhookEvents,
}
