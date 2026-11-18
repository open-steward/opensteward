import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'

export interface YonyouBillLine {
  id?: string
  description?: string
  price?: number
  quantity?: number
  amount?: number
  taxAmount?: number
  accountId?: string
  [key: string]: unknown
}

export interface YonyouBill {
  id?: string
  code?: string
  vouchdate?: string
  duedate?: string
  ttaxmny?: number
  tax?: number
  status?: number | string
  supplierid?: string
  currency?: string
  lines?: YonyouBillLine[]
  [key: string]: unknown
}

function mapStatus(s?: number | string): BillStatus {
  switch (String(s)) {
    case '2': return 'PAID'
    case '1': return 'AUTHORIZED'
    case '3': return 'VOIDED'
    case '0': return 'DRAFT'
    default: return 'DRAFT'
  }
}

export function transformBill(raw: YonyouBill): Bill {
  return {
    id: raw.id ? String(raw.id) : undefined,
    status: mapStatus(raw.status),
    billNumber: raw.code || undefined,
    contactId: raw.supplierid ? String(raw.supplierid) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.ttaxmny,
    taxAmount: raw.tax,
    balanceAmount: raw.ttaxmny,
    postedAt: raw.vouchdate ? new Date(raw.vouchdate) : undefined,
    dueAt: raw.duedate ? new Date(raw.duedate) : undefined,
    lineItems: (raw.lines ?? []).map(l => ({
      id: l.id ? String(l.id) : undefined,
      itemDescription: l.description || undefined,
      unitAmount: l.price,
      unitQuantity: l.quantity,
      totalAmount: l.amount,
      taxAmount: l.taxAmount,
      accountId: l.accountId ? String(l.accountId) : undefined,
    } satisfies Lineitem)),
    metadata: raw as Record<string, unknown>,
  }
}
