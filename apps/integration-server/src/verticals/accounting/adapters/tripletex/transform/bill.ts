import type { Bill, BillStatus } from '../../../schema/bill'

export interface TripletexSupplierInvoice {
  id: number
  invoiceNumber: string
  supplier: { id: number; name: string }
  invoiceDate: string
  paymentDueDate: string
  amountCurrency: number
  amountExcludingVat: number
  currency?: { id: string; code: string }
  isPaid: boolean
  paymentDate?: string
  [key: string]: unknown
}

function mapStatus(raw: TripletexSupplierInvoice): BillStatus {
  return raw.isPaid ? 'PAID' : 'AUTHORIZED'
}

export function transformBill(raw: TripletexSupplierInvoice): Bill {
  return {
    id: String(raw.id),
    status: mapStatus(raw),
    billNumber: raw.invoiceNumber || undefined,
    contactId: raw.supplier?.id ? String(raw.supplier.id) : undefined,
    currency: raw.currency?.code || undefined,
    totalAmount: raw.amountCurrency,
    postedAt: raw.invoiceDate ? new Date(raw.invoiceDate) : undefined,
    dueAt: raw.paymentDueDate ? new Date(raw.paymentDueDate) : undefined,
    paidAt: raw.paymentDate ? new Date(raw.paymentDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
