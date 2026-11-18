/**
 * Zoho Books webhook verification and parsing.
 *
 * Verification: Zoho Books sends a shared token in the
 * `x-zoho-books-event-token` header. Compare using constant-time equality.
 *
 * Docs: https://www.zoho.com/books/api/v3/webhooks/
 */

import { timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '../../webhook'
import type { WebhookResourceType, WebhookAction } from '../../schema/webhook'

// ── Zoho Books payload types ──────────────────────────────────────────────────

type ZohoBooksWebhookPayload = {
  event_type?: string      // e.g. "invoice_created"
  resource_id?: string
  resource_type?: string   // sometimes included
  organizationId?: string
  organization_id?: string
}

// ── Type maps ─────────────────────────────────────────────────────────────────

function mapFromEvent(eventType: string): {
  resourceType: WebhookResourceType
  action: WebhookAction
} {
  const lower = eventType.toLowerCase()

  let resourceType: WebhookResourceType = 'unknown'
  if (lower.startsWith('invoice')) resourceType = 'invoice'
  else if (lower.startsWith('bill') || lower.startsWith('vendor_bill')) resourceType = 'bill'
  else if (lower.startsWith('contact') || lower.startsWith('customer') || lower.startsWith('vendor'))
    resourceType = 'contact'
  else if (lower.startsWith('account')) resourceType = 'account'
  else if (lower.startsWith('journal')) resourceType = 'journal'
  else if (lower.startsWith('expense')) resourceType = 'expense'
  else if (lower.startsWith('creditnote') || lower.startsWith('credit_note'))
    resourceType = 'creditmemo'
  else if (lower.startsWith('salesorder') || lower.startsWith('sales_order'))
    resourceType = 'salesorder'
  else if (lower.startsWith('purchaseorder') || lower.startsWith('purchase_order'))
    resourceType = 'purchaseorder'
  else if (lower.startsWith('payment')) resourceType = 'payment'

  let action: WebhookAction = 'unknown'
  if (lower.endsWith('_created')) action = 'created'
  else if (lower.endsWith('_updated') || lower.endsWith('_approved') || lower.endsWith('_voided'))
    action = 'updated'
  else if (lower.endsWith('_deleted')) action = 'deleted'

  return { resourceType, action }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export const zohobooksWebhook: WebhookHandler = {
  verifyWebhook(_payload, headers, secret) {
    try {
      const token = headers['x-zoho-books-event-token'] ?? ''
      if (!token || !secret) return false
      const a = Buffer.from(token)
      const b = Buffer.from(secret)
      if (a.length !== b.length) return false
      return timingSafeEqual(a, b)
    } catch {
      return false
    }
  },

  parseWebhookEvents(payload) {
    const body = payload as ZohoBooksWebhookPayload
    if (!body.event_type) return []

    const { resourceType, action } = mapFromEvent(body.event_type)
    const tenantId = body.organizationId ?? body.organization_id

    return [
      {
        platform: 'zohobooks',
        type: `${resourceType}.${action}`,
        resourceType,
        action,
        resourceId: body.resource_id ?? '',
        tenantId,
        payload,
      },
    ]
  },
}
