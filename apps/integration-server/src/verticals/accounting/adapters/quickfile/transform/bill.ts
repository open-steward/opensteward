import type { Bill, BillStatus } from '../../../schema/bill'
import { toIsoDatetime } from '@opensteward/shared'
import { toMinorUnits, prefixedId } from '../../shared/transform'

/** Safely parse a QuickFile date string into a Date. Never throws. */
function toDate(val: unknown): Date | undefined {
  const iso = toIsoDatetime(val)
  return iso ? new Date(iso) : undefined
}

// QuickFile purchase invoice status values:
// DRAFT, SENT, DISPUTED, PAIDPART, PAIDFULL, ACTIVE, UNPAID, DELETED, CREDIT, CREDITED

export interface QuickFilePurchase {
  PurchaseID: number
  ReceiptNumber?: string
  SupplierID?: number
  SupplierName?: string
  ReceiptDate?: string
  DueDate?: string
  Currency?: string
  Status?: string
  GrossAmount?: number
  NetAmount?: number
  VatAmount?: number
  AmountOutstanding?: number
  AmountPaid?: number
  SupplierReference?: string
  [key: string]: unknown
}

function mapStatus(status?: string): BillStatus {
  switch ((status ?? '').toUpperCase()) {
    case 'PAIDFULL':
      return 'PAID'
    case 'PAIDPART':
      return 'PARTIALLY_PAID'
    case 'SENT':
    case 'ACTIVE':
    case 'UNPAID':
      return 'AUTHORIZED'
    case 'DISPUTED':
      return 'OVERDUE'
    case 'DELETED':
      return 'DELETED'
    case 'DRAFT':
      return 'DRAFT'
    default:
      return 'DRAFT'
  }
}

export function transformBill(raw: QuickFilePurchase): Bill {
  return {
    id: String(raw.PurchaseID),
    status: mapStatus(raw.Status),
    billNumber: raw.ReceiptNumber || undefined,
    contactId: prefixedId('supp', raw.SupplierID),
    currency: raw.Currency || undefined,
    totalAmount: toMinorUnits(raw.GrossAmount),
    taxAmount: toMinorUnits(raw.VatAmount),
    balanceAmount: toMinorUnits(raw.AmountOutstanding),
    paidAmount: toMinorUnits(raw.AmountPaid),
    notes: raw.SupplierReference || undefined,
    postedAt: toDate(raw.ReceiptDate),
    dueAt: toDate(raw.DueDate),
    metadata: raw as Record<string, unknown>,
  }
}
