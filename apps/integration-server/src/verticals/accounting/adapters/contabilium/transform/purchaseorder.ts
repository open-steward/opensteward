import { toCalendarDate } from '../../shared/transform'
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem, Address } from '../../../schema/shared'

export interface ContabiliumPurchaseOrderItem {
  id: number
  productoId: string
  descripcion: string
  precioUnitario: number
  cantidad: number
  total: number
  cuentaId: string
  [key: string]: unknown
}

export interface ContabiliumPurchaseOrder {
  id: number
  proveedorId: number
  proveedorNombre: string
  moneda: string
  total: number
  fecha: string
  estado: string
  direccionEntrega: string
  localidadEntrega: string
  provinciaEntrega: string
  paisEntrega: string
  referencia: string
  items: ContabiliumPurchaseOrderItem[]
  [key: string]: unknown
}

function mapStatus(status: string): PurchaseOrderStatus {
  if (status === 'Recibido' || status === 'Completado') return 'COMPLETED'
  if (status === 'Cancelado' || status === 'Anulado') return 'CANCELLED'
  return 'ACTIVE'
}

function mapLineitem(row: ContabiliumPurchaseOrderItem): Lineitem {
  return {
    id: String(row.id),
    accountId: row.cuentaId || undefined,
    itemId: row.productoId || undefined,
    itemDescription: row.descripcion || undefined,
    unitAmount: row.precioUnitario,
    unitQuantity: row.cantidad,
    totalAmount: row.total,
  }
}

function mapShippingAddress(raw: ContabiliumPurchaseOrder): Address | undefined {
  if (!raw.direccionEntrega && !raw.localidadEntrega) return undefined
  return {
    address1: raw.direccionEntrega || undefined,
    city: raw.localidadEntrega || undefined,
    region: raw.provinciaEntrega || undefined,
    country: raw.paisEntrega || undefined,
  }
}

export function transformPurchaseOrder(raw: ContabiliumPurchaseOrder): PurchaseOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw.estado),
    contactId: raw.proveedorId ? String(raw.proveedorId) : undefined,
    currency: raw.moneda || undefined,
    totalAmount: raw.total,
    lineItems: (raw.items ?? []).map(mapLineitem),
    shippingAddress: mapShippingAddress(raw),
    postedAt: raw.fecha ? new Date(raw.fecha) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformPurchaseOrder(
  order: Partial<PurchaseOrder>,
): Record<string, unknown> {
  return {
    proveedorId: order.contactId ? Number(order.contactId) : undefined,
    moneda: order.currency,
    fecha: toCalendarDate(order.postedAt),
    items: order.lineItems?.map((li) => ({
      productoId: li.itemId,
      descripcion: li.itemDescription,
      precioUnitario: li.unitAmount,
      cantidad: li.unitQuantity,
      cuentaId: li.accountId,
    })),
  }
}
