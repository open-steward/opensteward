/**
 * Webflow webhook verification and event parsing.
 *
 * Verification: Webflow does not natively sign webhook payloads with HMAC.
 * Instead, verification relies on the webhook secret being used as a shared
 * token. When a secret is configured, Webflow may include it as a query
 * param or the adapter can compare against a configured header. For maximum
 * safety we support HMAC-SHA256 verification if the caller provides a secret
 * (useful when behind a proxy that adds HMAC headers).
 *
 * Event parsing: Webflow sends the trigger type (e.g. `ecomm_new_order`) in
 * the payload `triggerType` field. Map these to canonical `{ resourceType, action }`.
 *
 * Docs: https://developers.webflow.com/data/reference/webhooks
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

export function verifyWebflowWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const headerSig = headers['x-webflow-signature'] ?? headers['X-Webflow-Signature']
    if (!headerSig) return false

    const expected = createHmac('sha256', secret).update(payload).digest('hex')
    const a = Buffer.from(headerSig)
    const b = Buffer.from(expected)
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

// ── TriggerType → canonical mapping ─────────────────────────────────────────

const TRIGGER_MAP: Record<string, { resourceType: WebhookResourceType; action: WebhookAction }> = {
  ecomm_new_order: { resourceType: 'orders', action: 'created' },
  ecomm_order_changed: { resourceType: 'orders', action: 'updated' },
  ecomm_inventory_changed: { resourceType: 'inventory_levels', action: 'updated' },
  collection_item_created: { resourceType: 'collections', action: 'created' },
  collection_item_changed: { resourceType: 'collections', action: 'updated' },
  collection_item_deleted: { resourceType: 'collections', action: 'deleted' },
  collection_item_unpublished: { resourceType: 'collections', action: 'deleted' },
}

/**
 * Parse a Webflow webhook delivery into zero-or-one canonical events.
 *
 * Webflow always delivers a single event per HTTP request, so this returns an
 * array of length 0 or 1.
 */
export function parseWebflowWebhookEvents(
  payload: Record<string, unknown>,
  triggerType?: string,
): WebhookEvent[] {
  const trigger = triggerType ?? (payload['triggerType'] as string | undefined) ?? ''
  const mapped = TRIGGER_MAP[trigger] ?? { resourceType: 'unknown' as const, action: 'unknown' as const }

  const rawId = payload['_id'] ?? payload['orderId'] ?? payload['itemId'] ?? ''
  const resourceId = String(rawId)

  return [
    {
      platform: 'webflow',
      type: `${mapped.resourceType}.${mapped.action}`,
      resourceType: mapped.resourceType,
      action: mapped.action,
      resourceId,
      payload,
    },
  ]
}

export const webflowWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook: verifyWebflowWebhook,
  parseWebhookEvents: parseWebflowWebhookEvents,
}
