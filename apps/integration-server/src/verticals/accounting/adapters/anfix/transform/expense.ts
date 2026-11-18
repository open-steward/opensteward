import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'

export interface AnfixExpenseRow {
  id: number
  descripcion: string
  cuenta: string
  total: number
  iva: number
  [key: string]: unknown
}

export interface AnfixExpense {
  id: string
  descripcion: string
  proveedor_id: string
  divisa: string
  total_factura: number
  cuota_iva: number
  fecha: string
  lineas: AnfixExpenseRow[]
  [key: string]: unknown
}

function mapLineitem(row: AnfixExpenseRow): Lineitem {
  return {
    id: String(row.id),
    accountId: row.cuenta || undefined,
    itemDescription: row.descripcion || undefined,
    totalAmount: row.total,
    taxAmount: row.iva || undefined,
  }
}

export function transformExpense(raw: AnfixExpense): Expense {
  return {
    id: raw.id,
    name: raw.descripcion || undefined,
    contactId: raw.proveedor_id || undefined,
    currency: raw.divisa || undefined,
    taxAmount: raw.cuota_iva || undefined,
    totalAmount: raw.total_factura,
    lineItems: (raw.lineas ?? []).map(mapLineitem),
    postedAt: raw.fecha ? new Date(raw.fecha) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
