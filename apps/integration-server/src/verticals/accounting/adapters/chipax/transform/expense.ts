import { toCalendarDate } from '../../shared/transform'
import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'

export interface ChipaxExpenseLine {
  id: number
  cuentaId: string
  descripcion: string
  total: number
  impuesto: number
  [key: string]: unknown
}

export interface ChipaxExpense {
  id: number
  descripcion: string
  proveedorId: number
  moneda: string
  total: number
  impuesto: number
  fechaEmision: string
  lineas: ChipaxExpenseLine[]
  [key: string]: unknown
}

function mapLineitem(row: ChipaxExpenseLine): Lineitem {
  return {
    id: String(row.id),
    accountId: row.cuentaId || undefined,
    itemDescription: row.descripcion || undefined,
    totalAmount: row.total,
    taxAmount: row.impuesto || undefined,
  }
}

export function transformExpense(raw: ChipaxExpense): Expense {
  return {
    id: String(raw.id),
    name: raw.descripcion || undefined,
    contactId: raw.proveedorId ? String(raw.proveedorId) : undefined,
    currency: raw.moneda || undefined,
    taxAmount: raw.impuesto || undefined,
    totalAmount: raw.total,
    lineItems: (raw.lineas ?? []).map(mapLineitem),
    postedAt: raw.fechaEmision ? new Date(raw.fechaEmision) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformExpense(expense: Partial<Expense>): Record<string, unknown> {
  return {
    proveedorId: expense.contactId ? Number(expense.contactId) : undefined,
    descripcion: expense.name,
    moneda: expense.currency,
    fechaEmision: toCalendarDate(expense.postedAt),
    lineas: expense.lineItems?.map((li) => ({
      cuentaId: li.accountId,
      descripcion: li.itemDescription,
      total: li.totalAmount,
    })),
  }
}
