import type { Bill, BillStatus } from '../../../schema/bill'

export interface EconomicSupplierInvoice {
  supplierInvoiceNumber: string
  supplier: { supplierNumber: number; name: string } | null
  date: string
  dueDate: string
  currency: string
  amount: number
  remainder: number
  vatAmount: number
  booked: boolean
  [key: string]: unknown
}

function mapStatus(inv: EconomicSupplierInvoice): BillStatus {
  if (inv.booked && inv.remainder === 0) return 'PAID'
  if (inv.booked && inv.remainder > 0 && inv.remainder < Math.abs(inv.amount)) return 'PARTIALLY_PAID'
  if (inv.booked) return 'AUTHORIZED'
  return 'DRAFT'
}

export function transformBill(raw: EconomicSupplierInvoice): Bill {
  return {
    id: raw.supplierInvoiceNumber,
    status: mapStatus(raw),
    billNumber: raw.supplierInvoiceNumber || undefined,
    contactId: raw.supplier?.supplierNumber ? String(raw.supplier.supplierNumber) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.amount,
    taxAmount: raw.vatAmount,
    balanceAmount: raw.remainder,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
