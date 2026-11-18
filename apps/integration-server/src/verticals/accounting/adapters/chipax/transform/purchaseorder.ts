import { toCalendarDate } from '../../shared/transform'
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem, Address } from '../../../schema/shared'

export interface ChipaxPurchaseOrderRow {
  id: number
  productoId: string
  descripcion: string
  precioUnitario: number
  cantidad: number
  total: number
  cuentaId: string
  [key: string]: unknown
}

export interface ChipaxPurchaseOrder {
  id: number
  proveedorId: number
  proveedorNombre: string
  moneda: string
  total: number
  fechaPedido: string
  estado: string
  direccionEntrega: string
  ciudadEntrega: string
  comunaEntrega: string
  paisEntrega: string
  referencia: string
  lineas: ChipaxPurchaseOrderRow[]
  [key: string]: unknown
}

function mapStatus(status: string): PurchaseOrderStatus {
  if (status === 'recibido' || status === 'completado') return 'COMPLETED'
  if (status === 'cancelado' || status === 'anulado') return 'CANCELLED'
  return 'ACTIVE'
}

function mapLineitem(row: ChipaxPurchaseOrderRow): Lineitem {
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

function mapShippingAddress(raw: ChipaxPurchaseOrder): Address | undefined {
  if (!raw.direccionEntrega && !raw.ciudadEntrega) return undefined
  return {
    address1: raw.direccionEntrega || undefined,
    city: raw.ciudadEntrega || undefined,
    region: raw.comunaEntrega || undefined,
    country: raw.paisEntrega || undefined,
  }
}

export function transformPurchaseOrder(raw: ChipaxPurchaseOrder): PurchaseOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw.estado),
    contactId: raw.proveedorId ? String(raw.proveedorId) : undefined,
    currency: raw.moneda || undefined,
    totalAmount: raw.total,
    lineItems: (raw.lineas ?? []).map(mapLineitem),
    shippingAddress: mapShippingAddress(raw),
    postedAt: raw.fechaPedido ? new Date(raw.fechaPedido) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformPurchaseOrder(
  order: Partial<PurchaseOrder>,
): Record<string, unknown> {
  return {
    proveedorId: order.contactId ? Number(order.contactId) : undefined,
    moneda: order.currency,
    fechaPedido: toCalendarDate(order.postedAt),
    lineas: order.lineItems?.map((li) => ({
      productoId: li.itemId,
      descripcion: li.itemDescription,
      precioUnitario: li.unitAmount,
      cantidad: li.unitQuantity,
      cuentaId: li.accountId,
    })),
  }
}
