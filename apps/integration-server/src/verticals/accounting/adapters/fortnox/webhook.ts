/**
 * Fortnox webhook verification and parsing.
 *
 * Verification: Fortnox sends a bearer token in the `authorization` header.
 * Compare against the configured webhook secret using constant-time comparison.
 *
 * Docs: https://developer.fortnox.se/documentation/webhooks/
 */

import { timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '../../webhook'
import type { WebhookEvent, WebhookResourceType, WebhookAction } from '../../schema/webhook'

// ── Fortnox payload types ─────────────────────────────────────────────────────

type FortnoxWebhookEvent = {
  eventId: string
  entityType: string   // e.g. "INVOICE", "CUSTOMER", "SUPPLIER_INVOICE"
  eventType: string    // e.g. "CREATED", "UPDATED", "DELETED"
  entityId: string
  companyId?: string
}

type FortnoxWebhookPayload = {
  entityType?: string
  eventType?: string
  entityId?: string
  events?: FortnoxWebhookEvent[]
}

// ── Type maps ─────────────────────────────────────────────────────────────────

function mapResourceType(entityType: string): WebhookResourceType {
  const map: Record<string, WebhookResourceType> = {
    INVOICE: 'invoice',
    SUPPLIER_INVOICE: 'bill',
    CUSTOMER: 'contact',
    SUPPLIER: 'contact',
    ACCOUNT: 'account',
    VOUCHER: 'journal',
    ARTICLE: 'unknown',
    ORDER: 'order',
    OFFER: 'salesorder',
    PURCHASE_ORDER: 'purchaseorder',
  }
  return map[entityType.toUpperCase()] ?? 'unknown'
}

function mapAction(eventType: string): WebhookAction {
  const ev = eventType.toUpperCase()
  if (ev.includes('CREAT')) return 'created'
  if (ev.includes('UPDAT')) return 'updated'
  if (ev.includes('DELET') || ev.includes('REMOV')) return 'deleted'
  return 'unknown'
}

// ── Handler ───────────────────────────────────────────────────────────────────

export const fortnoxWebhook: WebhookHandler = {
  verifyWebhook(_payload, headers, secret) {
    try {
      const authHeader = headers['authorization'] ?? ''
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader
      if (!token) return false
      const a = Buffer.from(token)
      const b = Buffer.from(secret)
      if (a.length !== b.length) return false
      return timingSafeEqual(a, b)
    } catch {
      return false
    }
  },

  parseWebhookEvents(payload) {
    const body = payload as FortnoxWebhookPayload

    // Fortnox can send a single top-level event or a batch in `events[]`
    const rawEvents: FortnoxWebhookEvent[] =
      Array.isArray(body.events) && body.events.length > 0
        ? body.events
        : body.entityType
          ? [
              {
                eventId: '',
                entityType: body.entityType,
                eventType: body.eventType ?? '',
                entityId: body.entityId ?? '',
              },
            ]
          : []

    return rawEvents.map((ev): WebhookEvent => {
      const resourceType = mapResourceType(ev.entityType)
      const action = mapAction(ev.eventType)
      return {
        id: ev.eventId || undefined,
        platform: 'fortnox',
        type: `${resourceType}.${action}`,
        resourceType,
        action,
        resourceId: ev.entityId,
        tenantId: ev.companyId,
        payload,
      }
    })
  },
}
