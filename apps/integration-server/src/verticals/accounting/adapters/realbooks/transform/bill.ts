import { toDate } from '../../shared/transform'
/**
 * RealBooks → canonical Bill transform.
 *
 * Purchase invoices (bills) in RealBooks are Inventory Vouchers with
 * transactionType = "Purchase".  The wire shape mirrors RealBooksInvoice
 * but the party ledger represents a supplier rather than a customer.
 *
 * Date format: RealBooks returns and expects dates in DD-MM-YYYY format.
 * Amounts: RealBooks uses decimal major units; canonical amounts are INTEGER
 * MINOR UNITS so we multiply by 100 and round via helpers imported from invoice.ts.
 */

import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'
import type {
  RealBooksInvoice,
  RealBooksItemDetail,
  RealBooksItemTax,
} from './invoice'
import { parseDDMMYYYY, toDDMMYYYY, toMinorUnits } from './invoice'

// Re-export so index.ts can import from one place
export type { RealBooksInvoice as RealBooksPurchaseVoucher }

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapStatus(_raw: RealBooksInvoice): BillStatus {
  return 'AUTHORIZED'
}

function mapLineitem(row: RealBooksItemDetail): Lineitem {
  const rawTax = (row.itemTax ?? ([] as RealBooksItemTax[])).reduce(
    (sum, t) => sum + (t.taxAmount ?? 0),
    0,
  )
  return {
    id: row.rowId !== undefined ? String(row.rowId) : undefined,
    itemId: row.itemCode || undefined,
    itemName: row.itemName || undefined,
    itemDescription: row.itemDescription || undefined,
    unitAmount: toMinorUnits(row.itemRate),
    unitQuantity: row.quantity != null ? Math.round(row.quantity) : undefined,
    discountAmount: toMinorUnits(row.discountAmount),
    taxAmount: rawTax ? toMinorUnits(rawTax) : undefined,
    totalAmount: toMinorUnits(row.itemAmount ?? row.itemGrossAmount),
  }
}

function totalAmount(raw: RealBooksInvoice): number | undefined {
  const txn = raw.accountsTransaction
  if (!txn?.ledgerDetails?.length) return undefined
  const cr = txn.ledgerDetails
    .filter((ld) => (ld.amountType ?? '').toLowerCase() === 'cr')
    .reduce((sum, ld) => sum + (ld.amount ?? 0), 0)
  return cr ? toMinorUnits(cr) : undefined
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformBill(raw: RealBooksInvoice): Bill {
  const txn = raw.accountsTransaction ?? raw
  const id = raw.id ?? (txn as RealBooksInvoice).id
  const txnNumber = raw.transactionNumber ?? (txn as RealBooksInvoice).transactionNumber
  const txnDate = raw.transactionDate ?? (txn as RealBooksInvoice).transactionDate

  return {
    id: id !== undefined ? String(id) : txnNumber,
    status: mapStatus(raw),
    billNumber: txnNumber || undefined,
    contactId: raw.partyLedger?.ledgerName || undefined,
    currency: raw.currencySymbol || undefined,
    totalAmount: totalAmount(raw),
    notes: raw.transactionDescription || undefined,
    lineItems: (raw.itemDetails ?? []).map(mapLineitem),
    postedAt: parseDDMMYYYY(txnDate),
    metadata: raw as Record<string, unknown>,
  }
}

// ── Untransform (canonical → RealBooks create body json_obj) ─────────────────

export function untransformBill(bill: Partial<Bill>): Record<string, unknown> {
  return {
    id: 0,
    transactionDate: toDDMMYYYY(toDate(bill.postedAt)),
    transactionNumber: bill.billNumber ?? '',
    transactionDescription: bill.notes ?? '',
    transactionType: 'Purchase',
    partyLedger: {
      id: 0,
      ledgerName: bill.contactId ?? '',
    },
    currencySymbol: bill.currency ?? '',
    itemDetails: (bill.lineItems ?? []).map((li, idx) => ({
      rowId: idx + 1,
      itemName: li.itemName ?? li.itemDescription ?? '',
      itemCode: li.itemId ?? '',
      // Canonical amounts are integer minor units; RealBooks expects decimal major units
      itemRate: li.unitAmount != null ? li.unitAmount / 100 : 0,
      quantity: li.unitQuantity ?? 1,
      itemAmount: li.totalAmount != null ? li.totalAmount / 100 : 0,
      itemGrossAmount: li.totalAmount != null ? li.totalAmount / 100 : 0,
      discountAmount: li.discountAmount != null ? li.discountAmount / 100 : 0,
    })),
  }
}
