/**
 * Ramp webhook verification and parsing.
 *
 * Verification: HMAC-SHA256 of the raw request body, signed with the
 * webhook secret provided at subscription creation time.
 * Signature arrives hex-encoded in the `X-Ramp-Signature` header.
 *
 * Event types documented by Ramp (2024):
 *   bills.*           — bills.created, bills.updated, bills.paid, bills.rejected, bills.archived
 *   transactions.*    — transactions.cleared, transactions.declined, transactions.synced
 *   reimbursements.*  — reimbursements.batch_payment_reimbursed
 *   vendors.*         — vendors.updated
 *   purchase_orders.* — purchase_orders.created, purchase_orders.archived
 *   payments.*        — payments.updated
 *   users.*           — users.invitation_accepted
 *
 * Docs: https://docs.ramp.com/developer-api/v1/guides/webhooks
 */

import type { WebhookHandler } from '../../webhook'
import type { WebhookEvent, WebhookResourceType, WebhookAction } from '../../schema/webhook'
import { verifyHmacSha256 } from '../../webhook'

// ── Ramp payload types ────────────────────────────────────────────────────────

type RampWebhookPayload = {
  event_type?: string   // e.g. "bills.created", "transactions.cleared"
  resource_id?: string
  resource_type?: string
  business_id?: string
  created_at?: string
  data?: Record<string, unknown>
  [key: string]: unknown
}

// ── Type maps ─────────────────────────────────────────────────────────────────

function parseResourceType(eventType: string): WebhookResourceType {
  const prefix = eventType.split('.')[0] ?? ''
  const map: Record<string, WebhookResourceType> = {
    bills: 'bill',
    transactions: 'transaction',
    reimbursements: 'expense',
    vendors: 'contact',
    purchase_orders: 'purchaseorder',
    payments: 'payment',
    users: 'unknown',
  }
  return map[prefix] ?? 'unknown'
}

function parseAction(eventType: string): WebhookAction {
  const suffix = eventType.split('.').slice(1).join('_')
  if (suffix.includes('created') || suffix.includes('accepted')) return 'created'
  if (
    suffix.includes('updated') ||
    suffix.includes('cleared') ||
    suffix.includes('synced') ||
    suffix.includes('paid') ||
    suffix.includes('reimbursed')
  )
    return 'updated'
  if (suffix.includes('archived') || suffix.includes('rejected') || suffix.includes('declined'))
    return 'deleted'
  return 'unknown'
}

// ── Handler ───────────────────────────────────────────────────────────────────

export const rampWebhook: WebhookHandler = {
  verifyWebhook(payload, headers, secret) {
    const sig = headers['x-ramp-signature'] ?? headers['X-Ramp-Signature'] ?? ''
    // Ramp signs with HMAC-SHA256; signature is hex-encoded
    return verifyHmacSha256(payload, secret, sig, 'hex')
  },

  parseWebhookEvents(payload) {
    const body = payload as RampWebhookPayload
    const eventType = body.event_type ?? ''
    if (!eventType) return []

    const resourceType = parseResourceType(eventType)
    const action = parseAction(eventType)

    const event: WebhookEvent = {
      platform: 'ramp',
      type: `${resourceType}.${action}`,
      resourceType,
      action,
      resourceId: body.resource_id ?? '',
      tenantId: body.business_id || undefined,
      payload,
    }

    return [event]
  },
}
