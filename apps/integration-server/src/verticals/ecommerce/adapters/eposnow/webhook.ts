/**
 * Epos Now webhook verification and event parsing.
 *
 * Epos Now webhooks deliver JSON payloads signed with HMAC-SHA256 in
 * the `X-Eposnow-Signature` header.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

export function verifyEposNowWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const headerSig =
      headers['x-eposnow-signature'] ??
      headers['X-Eposnow-Signature']
    if (!headerSig) return false

    const expected = createHmac('sha256', secret)
      .update(payload)
      .digest('hex')
    const a = Buffer.from(headerSig)
    const b = Buffer.from(expected)
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

// ── Event type -> canonical mapping ──────────────────────────────────────────

const RESOURCE_MAP: Record<string, WebhookResourceType> = {
  Product: 'products',
  Category: 'collections',
  Customer: 'customers',
  Transaction: 'orders',
  Location: 'locations',
  Discount: 'discounts',
}

const ACTION_MAP: Record<string, WebhookAction> = {
  Created: 'created',
  Updated: 'updated',
  Deleted: 'deleted',
}

/**
 * Parse an Epos Now webhook delivery into canonical events.
 *
 * Epos Now sends: `{ EventType, EntityType, EntityId, ... }`
 */
export function parseEposNowWebhookEvents(
  payload: Record<string, unknown>,
): WebhookEvent[] {
  const entityType = (payload['EntityType'] as string) ?? ''
  const eventType = (payload['EventType'] as string) ?? ''
  const entityId = String(payload['EntityId'] ?? '')
  const tenantId = payload['LocationId'] != null ? String(payload['LocationId']) : undefined

  if (!entityType || !entityId) return []

  const resourceType = RESOURCE_MAP[entityType] ?? 'unknown'
  const action = ACTION_MAP[eventType] ?? 'unknown'

  return [
    {
      platform: 'eposnow',
      type: `${resourceType}.${action}`,
      resourceType,
      action,
      resourceId: entityId,
      tenantId,
      payload,
    },
  ]
}

export const eposnowWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook: verifyEposNowWebhook,
  parseWebhookEvents: parseEposNowWebhookEvents,
}
