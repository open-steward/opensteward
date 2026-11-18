/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'

export interface FactusolExpenseRow {
  id: number
  descripcion: string
  cuenta: string
  total: number
  importe_iva: number
  [key: string]: unknown
}

export interface FactusolExpense {
  id: string
  descripcion: string
  proveedor_id: string
  divisa: string
  importe_total: number
  importe_iva: number
  fecha: string
  lineas: FactusolExpenseRow[]
  [key: string]: unknown
}

function mapLineitem(row: FactusolExpenseRow): Lineitem {
  return {
    id: String(row.id),
    accountId: row.cuenta || undefined,
    itemDescription: row.descripcion || undefined,
    totalAmount: row.total,
    taxAmount: row.importe_iva || undefined,
  }
}

export function transformExpense(raw: FactusolExpense): Expense {
  return {
    id: raw.id,
    name: raw.descripcion || undefined,
    contactId: raw.proveedor_id || undefined,
    currency: raw.divisa || undefined,
    taxAmount: raw.importe_iva || undefined,
    totalAmount: raw.importe_total,
    lineItems: (raw.lineas ?? []).map(mapLineitem),
    postedAt: raw.fecha ? new Date(raw.fecha) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
