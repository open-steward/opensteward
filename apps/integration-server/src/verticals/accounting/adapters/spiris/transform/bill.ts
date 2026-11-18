import type { Bill, BillStatus } from '../../../schema/bill'

export interface SpirisSupplierInvoice {
  Id: string
  SupplierId: string
  SupplierNumber: string
  InvoiceDate: string
  DueDate: string
  TotalAmount: number
  VatAmount: number
  RemainingAmount: number
  CurrencyCode: string
  InvoiceNumber: string
  CreatedUtc: string
  ModifiedUtc: string
  [key: string]: unknown
}

function mapStatus(inv: SpirisSupplierInvoice): BillStatus {
  if (inv.RemainingAmount === 0 && inv.TotalAmount > 0) return 'PAID'
  if (inv.RemainingAmount > 0 && inv.RemainingAmount < inv.TotalAmount) return 'PARTIALLY_PAID'
  if (inv.RemainingAmount > 0) return 'AUTHORIZED'
  return 'DRAFT'
}

export function transformBill(raw: SpirisSupplierInvoice): Bill {
  return {
    id: raw.Id,
    status: mapStatus(raw),
    billNumber: raw.InvoiceNumber || undefined,
    contactId: raw.SupplierId || undefined,
    currency: raw.CurrencyCode || undefined,
    totalAmount: raw.TotalAmount,
    taxAmount: raw.VatAmount,
    balanceAmount: raw.RemainingAmount,
    postedAt: raw.InvoiceDate ? new Date(raw.InvoiceDate) : undefined,
    dueAt: raw.DueDate ? new Date(raw.DueDate) : undefined,
    createdAt: raw.CreatedUtc ? new Date(raw.CreatedUtc) : undefined,
    updatedAt: raw.ModifiedUtc ? new Date(raw.ModifiedUtc) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
