import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem } from '../../../schema/shared'

export interface AnfixOrderRow {
  id: number
  descripcion: string
  precio: number
  cantidad: number
  total: number
  cuenta: string
  [key: string]: unknown
}

export interface AnfixOrder {
  id: string
  numero: string
  fecha: string
  estado: string
  cliente_id: string
  divisa: string
  total: number
  lineas: AnfixOrderRow[]
  [key: string]: unknown
}

function mapStatus(estado: string): OrderStatus {
  switch (estado) {
    case 'completado': return 'COMPLETED'
    case 'cancelado': return 'CANCELLED'
    default: return 'ACTIVE'
  }
}

function mapLineitem(row: AnfixOrderRow): Lineitem {
  return {
    id: String(row.id),
    accountId: row.cuenta || undefined,
    itemDescription: row.descripcion || undefined,
    unitAmount: row.precio,
    unitQuantity: row.cantidad,
    totalAmount: row.total,
  }
}

export function transformOrder(raw: AnfixOrder): Order {
  return {
    id: raw.id,
    status: mapStatus(raw.estado),
    type: 'SALES',
    contactId: raw.cliente_id || undefined,
    currency: raw.divisa || undefined,
    totalAmount: raw.total,
    lineItems: (raw.lineas ?? []).map(mapLineitem),
    postedAt: raw.fecha ? new Date(raw.fecha) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
