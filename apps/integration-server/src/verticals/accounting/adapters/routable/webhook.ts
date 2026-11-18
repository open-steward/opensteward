/**
 * Routable webhook verification and parsing.
 *
 * Signature verification:
 *   1. Compute HMAC-SHA256 over `${timestamp}.${rawBody}` using the webhook
 *      secret as the key.
 *   2. Compare against the value in the `Routable-Signature` header.
 *   The timestamp is taken from the `Routable-Signature-Timestamp` header.
 *
 * Docs: https://developers.routable.com/docs/webhooks
 *
 * Event payload shape:
 * {
 *   company_id: string,
 *   event_name: string,   // e.g. "payable.created"
 *   event_resource: string, // e.g. "payable"
 *   object_id: string,
 *   detail: unknown | null
 * }
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '../../webhook'
import type { WebhookEvent, WebhookResourceType, WebhookAction } from '../../schema/webhook'

// ── Routable payload types ────────────────────────────────────────────────────

type RoutableWebhookPayload = {
  company_id?: string
  event_name?: string      // e.g. "payable.created", "receivable.status_changed"
  event_resource?: string  // e.g. "payable", "receivable", "company"
  object_id?: string
  detail?: unknown
}

// ── Type maps ─────────────────────────────────────────────────────────────────

function mapResourceType(resource: string): WebhookResourceType {
  const map: Record<string, WebhookResourceType> = {
    payable: 'bill',
    receivable: 'invoice',
    company: 'contact',
    payment_method: 'unknown',
    tax_form: 'unknown',
    risk_report: 'unknown',
  }
  return map[resource.toLowerCase()] ?? 'unknown'
}

function mapAction(eventName: string): WebhookAction {
  const ev = eventName.toLowerCase()
  if (ev.endsWith('.created') || ev.endsWith('_created')) return 'created'
  if (ev.endsWith('.updated') || ev.endsWith('_updated')) return 'updated'
  if (ev.includes('status_change')) return 'updated'
  if (ev.includes('approval_changed')) return 'updated'
  if (ev.includes('invitation_accepted')) return 'updated'
  if (ev.endsWith('.deleted') || ev.endsWith('_deleted')) return 'deleted'
  return 'unknown'
}

// ── Handler ───────────────────────────────────────────────────────────────────

export const routableWebhook: WebhookHandler = {
  /**
   * Verify an incoming Routable webhook using HMAC-SHA256.
   *
   * The `secret` parameter is the webhook secret configured in the Routable
   * Dashboard. The raw request body (as a string) must be passed as `payload`
   * (i.e. the caller must pass the raw string, not a parsed object, for the
   * HMAC to be computed correctly).
   */
  verifyWebhook(payload, headers, secret) {
    try {
      const timestamp = headers['routable-signature-timestamp'] ?? ''
      const signature = headers['routable-signature'] ?? ''
      if (!timestamp || !signature) return false

      const rawBody = Buffer.isBuffer(payload)
        ? payload.toString('utf8')
        : typeof payload === 'string'
          ? payload
          : JSON.stringify(payload)
      const input = `${timestamp}.${rawBody}`

      const expected = createHmac('sha256', secret).update(input).digest('hex')
      const a = Buffer.from(expected)
      const b = Buffer.from(signature)
      if (a.length !== b.length) return false
      return timingSafeEqual(a, b)
    } catch {
      return false
    }
  },

  parseWebhookEvents(payload) {
    const body = payload as RoutableWebhookPayload
    const eventName = body.event_name ?? ''
    const resource = body.event_resource ?? eventName.split('.')[0] ?? ''
    const resourceType = mapResourceType(resource)
    const action = mapAction(eventName)

    const event: WebhookEvent = {
      platform: 'routable',
      type: eventName || `${resourceType}.${action}`,
      resourceType,
      action,
      resourceId: body.object_id ?? '',
      tenantId: body.company_id,
      payload,
    }
    return [event]
  },
}
