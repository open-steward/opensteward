import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'

export interface EcountExpenseItem {
  SEQ?: number
  ACCOUNT_CODE?: string
  DESCRIPTION?: string
  AMOUNT?: number
  VAT_AMT?: number
  [key: string]: unknown
}

export interface EcountExpense {
  SLIP_NO: string
  IO_DATE?: string
  EMP_CODE?: string
  EMP_NAME?: string
  TOTAL_AMT?: number
  STATUS?: string
  REMARK?: string
  ITEM_LIST?: EcountExpenseItem[]
  [key: string]: unknown
}

function mapLineitem(item: EcountExpenseItem): Lineitem {
  return {
    accountId: item.ACCOUNT_CODE || undefined,
    itemDescription: item.DESCRIPTION || undefined,
    totalAmount: item.AMOUNT ?? 0,
    taxAmount: item.VAT_AMT || undefined,
  }
}

export function transformExpense(raw: EcountExpense): Expense {
  return {
    id: raw.SLIP_NO,
    name: raw.REMARK || raw.SLIP_NO,
    totalAmount: raw.TOTAL_AMT ?? 0,
    lineItems: (raw.ITEM_LIST ?? []).map(mapLineitem),
    postedAt: raw.IO_DATE ? new Date(raw.IO_DATE) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
