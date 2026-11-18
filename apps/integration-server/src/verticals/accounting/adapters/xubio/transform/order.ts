import { toCalendarDate } from '../../shared/transform'
import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem } from '../../../schema/shared'

export interface XubioOrderLine {
  id: number
  productoId: string
  descripcion: string
  cantidad: number
  precioUnitario: number
  total: number
  impuesto: number
  cuentaId: string
  descuento: number
  [key: string]: unknown
}

export interface XubioOrder {
  id: number
  numero: string
  clienteId: number
  moneda: string
  fechaEmision: string
  estado: string
  total: number
  impuestos: number
  lineas: XubioOrderLine[]
  [key: string]: unknown
}

function mapStatus(estado: string): OrderStatus {
  if (estado === 'completado' || estado === 'facturado') return 'COMPLETED'
  if (estado === 'cancelado' || estado === 'anulado') return 'CANCELLED'
  if (estado === 'borrador') return 'DRAFT'
  return 'ACTIVE'
}

function mapLineitem(row: XubioOrderLine): Lineitem {
  return {
    id: String(row.id),
    accountId: row.cuentaId || undefined,
    itemId: row.productoId || undefined,
    itemDescription: row.descripcion || undefined,
    unitAmount: row.precioUnitario,
    unitQuantity: row.cantidad,
    totalAmount: row.total,
    taxAmount: row.impuesto || undefined,
    discountAmount: row.descuento || undefined,
  }
}

export function transformOrder(raw: XubioOrder): Order {
  return {
    id: String(raw.id),
    status: mapStatus(raw.estado),
    type: 'SALES',
    contactId: raw.clienteId ? String(raw.clienteId) : undefined,
    currency: raw.moneda || undefined,
    totalAmount: raw.total,
    lineItems: (raw.lineas ?? []).map(mapLineitem),
    postedAt: raw.fechaEmision ? new Date(raw.fechaEmision) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformOrder(order: Partial<Order>): Record<string, unknown> {
  return {
    clienteId: order.contactId ? Number(order.contactId) : undefined,
    moneda: order.currency,
    fechaEmision: toCalendarDate(order.postedAt),
    lineas: order.lineItems?.map((li) => ({
      productoId: li.itemId,
      descripcion: li.itemDescription,
      precioUnitario: li.unitAmount,
      cantidad: li.unitQuantity,
      cuentaId: li.accountId,
    })),
  }
}
