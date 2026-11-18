import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'

export interface DolibarrExpenseLine {
  id?: number | string
  type?: number | string
  comments?: string
  qty?: number
  value_unit?: number
  total_ht?: number
  total_tva?: number
  total_ttc?: number
  fk_c_type_fees?: number | string
  [key: string]: unknown
}

export interface DolibarrExpense {
  id?: number | string
  rowid?: number | string
  ref?: string
  date_debut?: number | string
  date_fin?: number | string
  total_ht?: number
  total_tva?: number
  total_ttc?: number
  user_author_info?: { fullname?: string } | null
  lines?: DolibarrExpenseLine[]
  [key: string]: unknown
}

function mapLineitem(line: DolibarrExpenseLine): Lineitem {
  return {
    itemDescription: line.comments || undefined,
    unitAmount: line.value_unit,
    unitQuantity: line.qty,
    totalAmount: line.total_ttc ?? line.total_ht ?? 0,
    taxAmount: line.total_tva || undefined,
  }
}

export function transformExpense(raw: DolibarrExpense): Expense {
  const id = raw.rowid ?? raw.id
  return {
    id: id !== undefined ? String(id) : '',
    name: raw.ref || String(id),
    totalAmount: raw.total_ttc ?? 0,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date_debut ? new Date(Number(raw.date_debut) * 1000) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
