/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'

export interface FactusolPurchaseOrderRow {
  id: number
  descripcion: string
  precio: number
  cantidad: number
  total: number
  cuenta: string
  [key: string]: unknown
}

export interface FactusolPurchaseOrder {
  id: string
  numero: string
  fecha: string
  estado: number
  proveedor_id: string
  divisa: string
  importe_total: number
  lineas: FactusolPurchaseOrderRow[]
  [key: string]: unknown
}

function mapStatus(estado: number): PurchaseOrderStatus {
  switch (estado) {
    case 2: return 'COMPLETED'
    case 3: return 'CANCELLED'
    default: return 'ACTIVE'
  }
}

function mapLineitem(row: FactusolPurchaseOrderRow): Lineitem {
  return {
    id: String(row.id),
    accountId: row.cuenta || undefined,
    itemDescription: row.descripcion || undefined,
    unitAmount: row.precio,
    unitQuantity: row.cantidad,
    totalAmount: row.total,
  }
}

export function transformPurchaseOrder(raw: FactusolPurchaseOrder): PurchaseOrder {
  return {
    id: raw.id,
    status: mapStatus(raw.estado),
    contactId: raw.proveedor_id || undefined,
    currency: raw.divisa || undefined,
    totalAmount: raw.importe_total,
    lineItems: (raw.lineas ?? []).map(mapLineitem),
    postedAt: raw.fecha ? new Date(raw.fecha) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
