import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'

export interface FikenBillLine {
  netPrice: number
  vatAmount: number
  grossPrice: number
  description: string
  accountCode: string
  vatType: string
  [key: string]: unknown
}

export interface FikenBill {
  purchaseId: number
  identifier: string
  supplierId: number
  currency: string
  net: number
  vat: number
  gross: number
  date: string
  dueDate: string
  paid: boolean
  settled: boolean
  lines: FikenBillLine[]
  [key: string]: unknown
}

function mapStatus(bill: FikenBill): BillStatus {
  if (bill.settled) return 'PAID'
  if (bill.paid) return 'PARTIALLY_PAID'
  return 'AUTHORIZED'
}

function mapLineitem(row: FikenBillLine): Lineitem {
  return {
    itemDescription: row.description || undefined,
    totalAmount: row.grossPrice,
    taxAmount: row.vatAmount || undefined,
    accountId: row.accountCode || undefined,
  }
}

export function transformBill(raw: FikenBill): Bill {
  return {
    id: String(raw.purchaseId),
    status: mapStatus(raw),
    billNumber: raw.identifier || undefined,
    contactId: raw.supplierId ? String(raw.supplierId) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.gross,
    taxAmount: raw.vat,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
