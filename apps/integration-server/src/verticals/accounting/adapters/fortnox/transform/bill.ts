import type { Bill, BillStatus } from '../../../schema/bill'
import { toMinorUnits, prefixedId } from '../../shared/transform'

export interface FortnoxSupplierInvoice {
  GivenNumber: string
  InvoiceNumber: string
  SupplierNumber: string
  SupplierName: string
  Total: number
  VAT: number
  Balance: number
  Currency: string
  InvoiceDate: string
  DueDate: string
  Booked: boolean
  Cancelled: boolean
  [key: string]: unknown
}

function mapStatus(inv: FortnoxSupplierInvoice): BillStatus {
  if (inv.Cancelled) return 'VOIDED'
  if (inv.Booked && inv.Balance === 0) return 'PAID'
  if (inv.Booked && inv.Balance > 0 && inv.Balance < inv.Total) return 'PARTIALLY_PAID'
  if (inv.Booked) return 'AUTHORIZED'
  return 'DRAFT'
}

export function transformBill(raw: FortnoxSupplierInvoice): Bill {
  return {
    id: raw.GivenNumber,
    status: mapStatus(raw),
    billNumber: raw.InvoiceNumber || undefined,
    contactId: prefixedId('supp', raw.SupplierNumber),
    currency: raw.Currency || undefined,
    totalAmount: toMinorUnits(raw.Total),
    taxAmount: toMinorUnits(raw.VAT),
    balanceAmount: toMinorUnits(raw.Balance),
    postedAt: raw.InvoiceDate ? new Date(raw.InvoiceDate) : undefined,
    dueAt: raw.DueDate ? new Date(raw.DueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
