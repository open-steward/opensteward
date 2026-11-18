import type { CreditMemo } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'

export interface FACreditLine {
  id?: number | string
  stock_id?: string
  description?: string
  quantity?: number
  unit_price?: number
  amount?: number
  tax_amount?: number
  account_id?: string | number
  [key: string]: unknown
}

export interface FACredit {
  id: number | string
  reference?: string
  tran_date?: string
  debtor_no?: number | string
  curr_code?: string
  total?: number
  tax_total?: number
  lines?: FACreditLine[]
  [key: string]: unknown
}

function mapLineitem(line: FACreditLine): Lineitem {
  return {
    itemId: line.stock_id || undefined,
    itemDescription: line.description || undefined,
    unitAmount: line.unit_price,
    unitQuantity: line.quantity,
    totalAmount: line.amount ?? 0,
    taxAmount: line.tax_amount || undefined,
    accountId: line.account_id !== undefined ? String(line.account_id) : undefined,
  }
}

export function transformCreditMemo(raw: FACredit): CreditMemo {
  return {
    id: String(raw.id),
    creditmemoNumber: raw.reference || undefined,
    contactId: raw.debtor_no !== undefined ? String(raw.debtor_no) : undefined,
    currency: raw.curr_code || undefined,
    totalAmount: raw.total ?? 0,
    taxAmount: raw.tax_total ?? 0,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.tran_date ? new Date(raw.tran_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
