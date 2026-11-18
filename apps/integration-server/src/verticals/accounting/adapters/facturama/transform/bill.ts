import { toCalendarDate } from '../../shared/transform'
import type { Bill, BillStatus } from '../../../schema/bill'

export interface FacturamaBill {
  Id: string
  Folio: string
  SupplierId: string
  Currency: string
  Total: number
  TaxAmount: number
  Balance: number
  Date: string
  DueDate: string
  Status: string
  IsCancelled: boolean
  [key: string]: unknown
}

function mapStatus(raw: FacturamaBill): BillStatus {
  if (raw.IsCancelled) return 'VOIDED'
  if (raw.Status === 'paid' || raw.Balance === 0) return 'PAID'
  if (raw.Balance > 0 && raw.Balance < raw.Total) return 'PARTIALLY_PAID'
  if (raw.Status === 'authorized') return 'AUTHORIZED'
  return 'DRAFT'
}

export function transformBill(raw: FacturamaBill): Bill {
  return {
    id: String(raw.Id),
    status: mapStatus(raw),
    billNumber: raw.Folio || undefined,
    contactId: raw.SupplierId || undefined,
    currency: raw.Currency || undefined,
    totalAmount: raw.Total,
    taxAmount: raw.TaxAmount,
    balanceAmount: raw.Balance,
    postedAt: raw.Date ? new Date(raw.Date) : undefined,
    dueAt: raw.DueDate ? new Date(raw.DueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformBill(bill: Partial<Bill>): Record<string, unknown> {
  return {
    SupplierId: bill.contactId,
    Currency: bill.currency,
    Date: toCalendarDate(bill.postedAt),
    DueDate: toCalendarDate(bill.dueAt),
    Total: bill.totalAmount,
    TaxAmount: bill.taxAmount,
  }
}
