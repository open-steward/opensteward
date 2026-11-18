/**
 * CashCtrl order → canonical Bill transform.
 *
 * In CashCtrl, incoming (purchase) orders — those whose order category is
 * typed as a purchase category — represent supplier bills. We reuse the same
 * CashCtrlOrder shape defined in invoice.ts and map it to the Bill schema.
 *
 * Docs: https://app.cashctrl.com/static/help/en/api/index.html#order
 */
import type { Bill, BillStatus } from '../../../schema/bill'
import type { CashCtrlOrder } from './invoice'

function mapStatus(order: CashCtrlOrder): BillStatus {
  if (order.isClosed && order.openAmount === 0) return 'PAID'
  if (order.isClosed && (order.openAmount ?? 0) > 0) return 'PARTIALLY_PAID'
  if (order.isBooked) return 'AUTHORIZED'
  return 'DRAFT'
}

export function transformBill(raw: CashCtrlOrder): Bill {
  return {
    id: String(raw.id),
    status: mapStatus(raw),
    billNumber: raw.nr || undefined,
    contactId: raw.associateId != null ? String(raw.associateId) : undefined,
    currency: raw.currencyCode || undefined,
    totalAmount: raw.total ?? undefined,
    taxAmount: raw.totalTax ?? undefined,
    balanceAmount: raw.openAmount ?? undefined,
    paidAmount:
      raw.total != null && raw.openAmount != null
        ? raw.total - raw.openAmount
        : undefined,
    notes: raw.notes || undefined,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
