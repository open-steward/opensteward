/**
 * Invoice Ninja v5 webhook verification and parsing.
 *
 * Verification: Invoice Ninja signs webhook payloads with HMAC-SHA256 using the
 * webhook secret configured in Settings > Account Management > Webhooks.
 * The signature is delivered in one of two headers:
 *   - X-Ninja-Signature
 *   - X-Invoice-Ninja-Signature
 * The value format is either a raw hex string or `sha256=<hex>`.
 *
 * Reference: https://github.com/AshkanYarmoradi/go-invoice-ninja (webhooks.go)
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '../../webhook'
import type { WebhookEvent, WebhookResourceType, WebhookAction } from '../../schema/webhook'

// ── Payload types ─────────────────────────────────────────────────────────────

type InvoiceNinjaWebhookPayload = {
  action?: string          // e.g. "create", "update", "delete"
  id?: string              // resource id
  company_id?: string
  data?: Record<string, unknown>
  [key: string]: unknown
}

// ── Type maps ─────────────────────────────────────────────────────────────────

function mapResourceType(eventType?: string): WebhookResourceType {
  if (!eventType) return 'unknown'
  const t = eventType.toLowerCase()
  if (t.includes('invoice')) return 'invoice'
  if (t.includes('credit')) return 'creditmemo'
  if (t.includes('quote')) return 'salesorder'
  if (t.includes('purchase_order') || t.includes('purchaseorder')) return 'purchaseorder'
  if (t.includes('client')) return 'contact'
  if (t.includes('vendor')) return 'contact'
  if (t.includes('payment')) return 'transaction'
  if (t.includes('expense')) return 'expense'
  return 'unknown'
}

function mapAction(action?: string): WebhookAction {
  if (!action) return 'unknown'
  const a = action.toLowerCase()
  if (a === 'create' || a === 'created') return 'created'
  if (a === 'update' || a === 'updated') return 'updated'
  if (a === 'delete' || a === 'deleted') return 'deleted'
  return 'unknown'
}

// ── Handler ───────────────────────────────────────────────────────────────────

export const invoiceNinjaWebhook: WebhookHandler = {
  verifyWebhook(payload, headers, secret) {
    try {
      // Accept either header variant
      const rawSig =
        headers['x-ninja-signature'] ??
        headers['x-invoice-ninja-signature'] ??
        ''
      if (!rawSig) return false

      // Strip optional "sha256=" prefix
      const sigHex = rawSig.startsWith('sha256=') ? rawSig.slice(7) : rawSig

      // payload is always a Buffer per the WebhookHandler interface.
      // Buffer.toString('utf8') yields the raw request body string that
      // Invoice Ninja signed. JSON.stringify(Buffer) produces
      // {"type":"Buffer","data":[...]} which is NOT the signed content.
      const body = Buffer.isBuffer(payload)
        ? payload.toString('utf8')
        : typeof payload === 'string'
          ? payload
          : JSON.stringify(payload)

      const expected = createHmac('sha256', secret)
        .update(body)
        .digest('hex')

      if (sigHex.length !== expected.length) return false
      return timingSafeEqual(Buffer.from(sigHex), Buffer.from(expected))
    } catch {
      return false
    }
  },

  parseWebhookEvents(payload) {
    const body = payload as InvoiceNinjaWebhookPayload

    // Invoice Ninja webhook body contains `action` and the entity type is
    // inferred from the subscription event_id string (not always present in
    // the payload itself). We fall back to inspecting known payload keys.
    const eventType: string =
      (body['event_id'] as string | undefined) ??
      (body['entity'] as string | undefined) ??
      ''

    const resourceType = mapResourceType(eventType)
    const action = mapAction(body.action)

    const resourceId =
      (body.id as string | undefined) ??
      (body.data?.id as string | undefined) ??
      ''

    const event: WebhookEvent = {
      platform: 'invoice-ninja',
      type: `${resourceType}.${action}`,
      resourceType,
      action,
      resourceId,
      tenantId: body.company_id,
      payload,
    }

    return [event]
  },
}
