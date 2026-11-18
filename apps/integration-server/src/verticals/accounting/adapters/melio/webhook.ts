/**
 * Melio Platform API webhook verification and parsing.
 *
 * Verification: HMAC-SHA256 of raw body using the webhook signing secret.
 * Signature arrives hex-encoded in the `melio-signature` header.
 *
 * Melio emits events for bills, vendors, invoices, and payments.
 */

import type { WebhookHandler } from '../../webhook'
import type { WebhookEvent, WebhookResourceType, WebhookAction } from '../../schema/webhook'
import { verifyHmacSha256 } from '../../webhook'

// ── Melio webhook payload types ───────────────────────────────────────────────

type MelioWebhookEvent = {
  id?: string
  eventType: string       // e.g. "bill.created", "vendor.updated", "payment.scheduled"
  entityId: string
  entityType: string      // "bill" | "vendor" | "invoice" | "payment"
  action: string          // "created" | "updated" | "deleted"
  organizationId?: string
  occurredAt?: string
  data?: Record<string, unknown>
}

type MelioWebhookPayload = {
  events?: MelioWebhookEvent[]
  // Some platforms send a single top-level event
  eventType?: string
  entityId?: string
  entityType?: string
  action?: string
  organizationId?: string
}

// ── Type maps ─────────────────────────────────────────────────────────────────

function mapResourceType(entityType: string): WebhookResourceType {
  const map: Record<string, WebhookResourceType> = {
    bill: 'bill',
    vendor: 'contact',
    invoice: 'invoice',
    payment: 'payment',
    organization: 'organization',
  }
  return map[entityType.toLowerCase()] ?? 'unknown'
}

function mapAction(action: string): WebhookAction {
  const a = action.toLowerCase()
  if (a === 'created') return 'created'
  if (a === 'updated' || a === 'scheduled' || a === 'approved' || a === 'voided') return 'updated'
  if (a === 'deleted' || a === 'cancelled') return 'deleted'
  return 'unknown'
}

function parseSingleEvent(
  e: MelioWebhookEvent,
  fallbackOrgId?: string,
  payload?: Record<string, unknown>,
): WebhookEvent {
  const resourceType = mapResourceType(e.entityType ?? '')
  const action = mapAction(e.action ?? '')
  return {
    id: e.id || undefined,
    platform: 'melio',
    type: `${resourceType}.${action}`,
    resourceType,
    action,
    resourceId: e.entityId,
    tenantId: e.organizationId ?? fallbackOrgId ?? undefined,
    payload: payload ?? {},
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export const melioWebhook: WebhookHandler = {
  verifyWebhook(payload, headers, secret) {
    const sig = headers['melio-signature'] ?? ''
    return verifyHmacSha256(payload, secret, sig, 'hex')
  },

  parseWebhookEvents(payload) {
    const body = payload as MelioWebhookPayload
    const events: WebhookEvent[] = []

    // Array envelope form: { events: [...] }
    if (Array.isArray(body.events) && body.events.length > 0) {
      for (const e of body.events) {
        events.push(parseSingleEvent(e, e.organizationId, payload))
      }
      return events
    }

    // Single-event form: { eventType, entityId, entityType, action, organizationId }
    if (body.entityId && body.entityType) {
      events.push(
        parseSingleEvent(
          {
            entityId: body.entityId,
            entityType: body.entityType,
            action: body.action ?? 'updated',
            eventType: body.eventType ?? '',
            organizationId: body.organizationId,
          },
          body.organizationId,
          payload,
        ),
      )
    }

    return events
  },
}
