import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'

export interface AnfixPurchaseOrderRow {
  id: number
  descripcion: string
  precio: number
  cantidad: number
  total: number
  cuenta: string
  [key: string]: unknown
}

export interface AnfixPurchaseOrder {
  id: string
  numero: string
  fecha: string
  estado: string
  proveedor_id: string
  divisa: string
  total: number
  lineas: AnfixPurchaseOrderRow[]
  [key: string]: unknown
}

function mapStatus(estado: string): PurchaseOrderStatus {
  switch (estado) {
    case 'recibido': return 'COMPLETED'
    case 'cancelado': return 'CANCELLED'
    default: return 'ACTIVE'
  }
}

function mapLineitem(row: AnfixPurchaseOrderRow): Lineitem {
  return {
    id: String(row.id),
    accountId: row.cuenta || undefined,
    itemDescription: row.descripcion || undefined,
    unitAmount: row.precio,
    unitQuantity: row.cantidad,
    totalAmount: row.total,
  }
}

export function transformPurchaseOrder(raw: AnfixPurchaseOrder): PurchaseOrder {
  return {
    id: raw.id,
    status: mapStatus(raw.estado),
    contactId: raw.proveedor_id || undefined,
    currency: raw.divisa || undefined,
    totalAmount: raw.total,
    lineItems: (raw.lineas ?? []).map(mapLineitem),
    postedAt: raw.fecha ? new Date(raw.fecha) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
