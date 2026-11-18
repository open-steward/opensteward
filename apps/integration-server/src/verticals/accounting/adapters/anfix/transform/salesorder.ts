import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem } from '../../../schema/shared'

export interface AnfixSalesOrderRow {
  id: number
  descripcion: string
  precio: number
  cantidad: number
  total: number
  cuenta: string
  [key: string]: unknown
}

export interface AnfixSalesOrder {
  id: string
  numero: string
  fecha: string
  estado: string
  cliente_id: string
  divisa: string
  total: number
  lineas: AnfixSalesOrderRow[]
  [key: string]: unknown
}

function mapStatus(estado: string): SalesOrderStatus {
  switch (estado) {
    case 'completado': return 'COMPLETED'
    case 'cancelado': return 'CANCELLED'
    default: return 'ACTIVE'
  }
}

function mapLineitem(row: AnfixSalesOrderRow): Lineitem {
  return {
    id: String(row.id),
    accountId: row.cuenta || undefined,
    itemDescription: row.descripcion || undefined,
    unitAmount: row.precio,
    unitQuantity: row.cantidad,
    totalAmount: row.total,
  }
}

export function transformSalesOrder(raw: AnfixSalesOrder): SalesOrder {
  return {
    id: raw.id,
    status: mapStatus(raw.estado),
    contactId: raw.cliente_id || undefined,
    currency: raw.divisa || undefined,
    totalAmount: raw.total,
    lineItems: (raw.lineas ?? []).map(mapLineitem),
    postedAt: raw.fecha ? new Date(raw.fecha) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
