/**
 * VosFactures → canonical Bill transform.
 *
 * VosFactures does not have a dedicated supplier invoice resource.  Expense
 * documents are regular invoices with `income = "0"`.  This transform accepts
 * a VosFactures invoice object that has already been filtered to income=0 and
 * maps it to the canonical Bill shape.
 *
 * Re-uses the VosFacturesInvoice interface and the position mapping from the
 * invoice transform. Amounts are reported in minor units of the document's
 * `currency` (../money.ts names the fields and their README source).
 *
 * Docs: https://github.com/vosfactures/API
 */
import type { Bill, BillStatus } from '../../../schema/bill'
import { documentAmounts } from '../money'
import { mapPosition, type VosFacturesInvoice } from './invoice'

// ── Helpers ───────────────────────────────────────────────────────────────

function mapStatus(raw: VosFacturesInvoice): BillStatus {
  switch (raw.status) {
    case 'paid':
      return 'PAID'
    case 'partial':
      return 'PARTIALLY_PAID'
    case 'rejected':
      return 'VOIDED'
    case 'sent':
    case 'accepted':
      return 'AUTHORIZED'
    case 'issued':
      return 'DRAFT'
    default:
      return 'DRAFT'
  }
}

// ── Public transform ──────────────────────────────────────────────────────

export function transformBill(raw: VosFacturesInvoice): Bill {
  const currency = raw.currency || undefined
  const { totalAmount, taxAmount, paidAmount, balanceAmount } = documentAmounts(raw, currency)

  return {
    id: String(raw.id),
    status: mapStatus(raw),
    billNumber: raw.number || undefined,
    contactId: raw.client_id !== undefined ? String(raw.client_id) : undefined,
    currency,
    totalAmount,
    taxAmount,
    paidAmount,
    balanceAmount,
    notes: raw.description || undefined,
    postedAt: raw.issue_date ? new Date(raw.issue_date) : undefined,
    dueAt: raw.payment_to ? new Date(raw.payment_to) : undefined,
    lineItems: Array.isArray(raw.positions)
      ? raw.positions.map((pos) => mapPosition(pos, currency))
      : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
