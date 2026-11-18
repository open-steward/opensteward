/**
 * Sage X3 webhook stub.
 *
 * Sage X3 does not publish a documented HMAC or JWT signing scheme for
 * inbound webhook payloads in its public developer documentation.  The
 * standard integration pattern is pull-based (polling the REST API) or
 * workflow-triggered outbound calls via the Sage X3 Workflow engine, where
 * the customer configures their own security (e.g. Basic Auth or a shared
 * token in a custom HTTP header).
 *
 * This stub:
 *   - verifyWebhook always returns false (no signing scheme documented)
 *   - parseWebhookEvents performs best-effort parsing of any JSON payload
 *     that Sage X3 Workflow might POST
 *
 * If a future Sage X3 version or SaaS offering documents HMAC/JWT signing,
 * replace verifyWebhook with the real implementation.
 */
import type { WebhookHandler } from '@opensteward/shared'
import type { WebhookAction, WebhookEvent, WebhookResourceType } from '../../schema/webhook'

/**
 * Sage X3 does not have documented HMAC/JWT webhook signing.
 * Always returns false — callers should not rely on webhook verification
 * for Sage X3; use network-level controls instead (IP allowlist, mTLS).
 */
export function verifySageX3Webhook(
  _payload: Buffer,
  _headers: Record<string, string>,
  _secret: string,
): boolean {
  return false
}

/**
 * Attempt to extract a WebhookEvent from a Sage X3 Workflow outbound POST.
 *
 * Sage X3 Workflow can POST a JSON body with arbitrary fields.  We inspect
 * common naming conventions used by X3 workflow events.
 */
const EVENT_TYPE_MAP: Record<string, { resourceType: WebhookResourceType; action: WebhookAction }> = {
  // Product events
  ITMMASTER_INSERT: { resourceType: 'products', action: 'created' },
  ITMMASTER_UPDATE: { resourceType: 'products', action: 'updated' },
  ITMMASTER_DELETE: { resourceType: 'products', action: 'deleted' },
  // Stock events
  STKCNSSDIM_UPDATE: { resourceType: 'stock-levels', action: 'updated' },
  INVADJ_INSERT: { resourceType: 'stock-adjustments', action: 'adjusted' },
  INVADJ_VALIDATED: { resourceType: 'stock-adjustments', action: 'adjusted' },
  PORDER_INSERT: { resourceType: 'purchase-orders', action: 'created' },
  PORDER_UPDATE: { resourceType: 'purchase-orders', action: 'updated' },
  PORDER_RECEIVED: { resourceType: 'purchase-orders', action: 'received' },
  MISREC_INSERT: { resourceType: 'stock-transfers', action: 'created' },
  MISREC_COMPLETED: { resourceType: 'stock-transfers', action: 'updated' },
}

export function parseSageX3WebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  // Try to extract a meaningful event type from the payload
  const eventType = String(
    payload['eventType'] ?? payload['EVENT_TYPE'] ?? payload['type'] ?? '',
  ).toUpperCase()

  const resourceId = String(
    payload['id'] ?? payload['ID'] ?? payload['VCRNUM'] ?? payload['POHNUM'] ?? payload['ITMREF'] ?? '',
  )

  const mapped = EVENT_TYPE_MAP[eventType] ?? {
    resourceType: 'unknown' as WebhookResourceType,
    action: 'unknown' as WebhookAction,
  }

  return [
    {
      id: `sage-x3:${eventType}:${resourceId}`,
      platform: 'sage-x3-inventory',
      type: eventType,
      resourceType: mapped.resourceType,
      action: mapped.action,
      resourceId,
      payload,
    },
  ]
}

export const SageX3InventoryWebhookHandler: WebhookHandler = {
  verifyWebhook: verifySageX3Webhook,
  parseWebhookEvents: parseSageX3WebhookEvents,
}
