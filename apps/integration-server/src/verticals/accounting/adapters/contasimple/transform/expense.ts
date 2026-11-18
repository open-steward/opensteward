import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'

export interface ContasimpleExpenseRow {
  id: number
  descripcion: string
  cuenta: string
  total: number
  iva: number
  [key: string]: unknown
}

export interface ContasimpleExpense {
  id: string
  descripcion: string
  proveedor_id: string
  moneda: string
  total: number
  iva: number
  fecha: string
  lineas: ContasimpleExpenseRow[]
  [key: string]: unknown
}

function mapLineitem(row: ContasimpleExpenseRow): Lineitem {
  return {
    id: String(row.id),
    accountId: row.cuenta || undefined,
    itemDescription: row.descripcion || undefined,
    totalAmount: row.total,
    taxAmount: row.iva || undefined,
  }
}

export function transformExpense(raw: ContasimpleExpense): Expense {
  return {
    id: raw.id,
    name: raw.descripcion || undefined,
    contactId: raw.proveedor_id || undefined,
    currency: raw.moneda || undefined,
    taxAmount: raw.iva || undefined,
    totalAmount: raw.total,
    lineItems: (raw.lineas ?? []).map(mapLineitem),
    postedAt: raw.fecha ? new Date(raw.fecha) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
