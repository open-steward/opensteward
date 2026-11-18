/**
 * Crater webhook verification and parsing.
 *
 * Verification: Crater signs the request body with HMAC-SHA256 using the
 * webhook secret configured in the dashboard.  The resulting hex digest is
 * sent in the `x-crater-signature` header.
 *
 * Payload shape:
 *   { "event": "invoice.updated", "payload": { "id": "...", ... } }
 *
 * Docs: https://docs.crater.financial/webhooks
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '../../webhook'
import type { WebhookEvent, WebhookResourceType, WebhookAction } from '../../schema/webhook'

// ── Payload type ──────────────────────────────────────────────────────────────

type CraterWebhookPayload = {
  event?: string
  payload?: { id?: string; [key: string]: unknown }
}

// ── Type maps ─────────────────────────────────────────────────────────────────

function mapResourceType(event: string): WebhookResourceType {
  const resource = event.split('.')[0] ?? ''
  const map: Record<string, WebhookResourceType> = {
    invoice: 'invoice',
    'recurring-invoice': 'invoice',
    payment: 'transaction',
    estimate: 'salesorder',
    business: 'contact',
    customer: 'contact',
    vendor: 'contact',
  }
  return map[resource] ?? 'unknown'
}

function mapAction(event: string): WebhookAction {
  const action = event.split('.')[1] ?? ''
  if (action === 'created') return 'created'
  if (action === 'updated' || action === 'approved' || action === 'finalized') return 'updated'
  if (action === 'deleted') return 'deleted'
  return 'unknown'
}

// ── Handler ───────────────────────────────────────────────────────────────────

export const craterWebhook: WebhookHandler = {
  verifyWebhook(payload, headers, secret) {
    try {
      const signature = headers['x-crater-signature'] ?? ''
      if (!signature) return false
      const expected = createHmac('sha256', secret).update(payload).digest('hex')
      const a = Buffer.from(signature)
      const b = Buffer.from(expected)
      if (a.length !== b.length) return false
      return timingSafeEqual(a, b)
    } catch {
      return false
    }
  },

  parseWebhookEvents(payload) {
    const body = payload as CraterWebhookPayload
    const event = body.event ?? ''
    if (!event) return []

    const resourceType = mapResourceType(event)
    const action = mapAction(event)
    const resourceId = body.payload?.id ?? ''

    const webhookEvent: WebhookEvent = {
      platform: 'crater',
      type: event,
      resourceType,
      action,
      resourceId,
      payload,
    }
    return [webhookEvent]
  },
}
