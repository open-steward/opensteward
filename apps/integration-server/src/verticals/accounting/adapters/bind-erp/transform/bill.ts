/**
 * Bind ERP → canonical Bill transform.
 *
 * Source: GET /api/Expenses/{id}
 *
 * In Bind ERP there is no dedicated "bill" endpoint.  Supplier
 * purchase documents (órdenes de gasto) are returned by
 * GET /api/Expenses/{id} as ExpenseDetails.  That model is the
 * closest analogue to a canonical Bill; it carries the provider,
 * amounts, VAT, and line items needed to populate the Bill schema.
 *
 * Because there is no list endpoint for expenses/bills, only
 * getBill (by ID) is implemented.
 *
 * Re-uses the BindExpenseDetails raw type from the expense transform.
 */

import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'
import type { BindExpenseDetails, BindExpensePurchaseOrderItem } from './expense'

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapStatusCode(code?: number): BillStatus {
  // StatusCode observed values (inferred from SDK — mirrors invoice codes):
  //   1 = open/authorized, 2 = voided/cancelled, 3 = paid
  if (code === 2) return 'VOIDED'
  if (code === 3) return 'PAID'
  return 'AUTHORIZED'
}

function itemToLineitem(item: BindExpensePurchaseOrderItem): Lineitem {
  return {
    id: item.IndexItem !== undefined ? String(item.IndexItem) : item.ID || undefined,
    itemId: item.TypeID || undefined,
    itemName: item.Name || undefined,
    unitAmount: item.Cost ?? 0,
    unitQuantity: item.Qty !== undefined ? Math.round(item.Qty) : undefined,
  }
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformBill(raw: BindExpenseDetails): Bill {
  const items = raw.ExpensePurchaseOrderItems ?? []
  const subtotal = items.reduce((acc, i) => acc + (i.Cost ?? 0) * (i.Qty ?? 1), 0)
  const taxAmount = (raw.VAT ?? 0) + (raw.IEPS ?? 0) - (raw.VATRetention ?? 0) - (raw.ISRRetention ?? 0)
  const totalAmount = subtotal - (raw.Discount ?? 0) + taxAmount

  return {
    id: raw.ID || raw.UUID || '',
    status: mapStatusCode(raw.StatusCode),
    billNumber: raw.DocumentNumber || (raw.Series ? `${raw.Series}` : undefined),
    contactId: raw.ProviderID || undefined,
    currency: raw.CurrencyName || raw.CurrencyID || undefined,
    totalAmount: totalAmount || undefined,
    taxAmount: taxAmount || undefined,
    discountAmount: raw.Discount || undefined,
    notes: raw.Comments || undefined,
    lineItems: items.length ? items.map(itemToLineitem) : undefined,
    postedAt: raw.CreationDate ? new Date(raw.CreationDate) : undefined,
    createdAt: raw.CreationDate ? new Date(raw.CreationDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
