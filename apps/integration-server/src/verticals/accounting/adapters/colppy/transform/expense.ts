import { toCalendarDate } from '../../shared/transform'
import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'

export interface ColppyExpenseItem {
  idItem: number
  idCuenta: number
  descripcion: string
  total: number
  iva: number
  [key: string]: unknown
}

export interface ColppyExpense {
  idGasto: number
  descripcion: string
  idProveedor: number
  total: number
  iva: number
  moneda: string
  fechaEmision: string
  items: ColppyExpenseItem[]
  [key: string]: unknown
}

function mapLineitem(row: ColppyExpenseItem): Lineitem {
  return {
    id: String(row.idItem),
    accountId: row.idCuenta ? String(row.idCuenta) : undefined,
    itemDescription: row.descripcion || undefined,
    totalAmount: row.total,
    taxAmount: row.iva || undefined,
  }
}

export function transformExpense(raw: ColppyExpense): Expense {
  return {
    id: String(raw.idGasto),
    name: raw.descripcion || undefined,
    contactId: raw.idProveedor ? String(raw.idProveedor) : undefined,
    currency: raw.moneda || undefined,
    taxAmount: raw.iva || undefined,
    totalAmount: raw.total,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.fechaEmision ? new Date(raw.fechaEmision) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformExpense(expense: Partial<Expense>): Record<string, unknown> {
  return {
    idProveedor: expense.contactId ? Number(expense.contactId) : undefined,
    descripcion: expense.name,
    moneda: expense.currency,
    fechaEmision: toCalendarDate(expense.postedAt),
    items: expense.lineItems?.map((li) => ({
      idCuenta: li.accountId ? Number(li.accountId) : undefined,
      descripcion: li.itemDescription,
      total: li.totalAmount,
    })),
  }
}
