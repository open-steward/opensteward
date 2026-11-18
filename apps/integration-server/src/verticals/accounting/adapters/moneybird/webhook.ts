/**
 * Moneybird webhook verification and parsing.
 *
 * Verification: HMAC-SHA256 of raw body using the Moneybird webhook secret.
 * Signature arrives hex-encoded in the `x-moneybird-signature` header.
 *
 * Docs: https://developer.moneybird.com/api/webhooks/
 */

import type { WebhookHandler } from '../../webhook'
import type { WebhookResourceType, WebhookAction } from '../../schema/webhook'
import { verifyHmacSha256 } from '../../webhook'

// ── Moneybird payload types ───────────────────────────────────────────────────

type MoneybirdWebhookPayload = {
  action?: string            // e.g. "document_style_created"
  entity_type?: string       // e.g. "SalesInvoice", "Contact", "ExternalSalesInvoice"
  entity_id?: string | number
  administration_id?: string | number
}

// ── Type maps ─────────────────────────────────────────────────────────────────

function mapResourceType(entityType: string): WebhookResourceType {
  const map: Record<string, WebhookResourceType> = {
    SalesInvoice: 'invoice',
    RecurringSalesInvoice: 'invoice',
    ExternalSalesInvoice: 'bill',
    Contact: 'contact',
    LedgerAccount: 'account',
    JournalDocument: 'journal',
    FinancialMutation: 'transaction',
    FinancialStatement: 'transaction',
    Receipt: 'expense',
    Purchase: 'purchaseorder',
    Quote: 'salesorder',
    TaxRate: 'taxrate',
  }
  return map[entityType] ?? 'unknown'
}

function mapActionFromEvent(action: string): WebhookAction {
  const lower = action.toLowerCase()
  if (lower.endsWith('_created')) return 'created'
  if (lower.endsWith('_updated') || lower.endsWith('_updated_payment')) return 'updated'
  if (lower.endsWith('_destroyed') || lower.endsWith('_deleted')) return 'deleted'
  return 'unknown'
}

// ── Handler ───────────────────────────────────────────────────────────────────

export const moneybirdWebhook: WebhookHandler = {
  verifyWebhook(payload, headers, secret) {
    const sig = headers['x-moneybird-signature'] ?? ''
    return verifyHmacSha256(payload, secret, sig, 'hex')
  },

  parseWebhookEvents(payload) {
    const body = payload as MoneybirdWebhookPayload
    if (!body.entity_type || !body.entity_id) return []

    const resourceType = mapResourceType(body.entity_type)
    const action = body.action ? mapActionFromEvent(body.action) : 'unknown'

    return [
      {
        platform: 'moneybird',
        type: `${resourceType}.${action}`,
        resourceType,
        action,
        resourceId: String(body.entity_id),
        tenantId: body.administration_id ? String(body.administration_id) : undefined,
        payload,
      },
    ]
  },
}
