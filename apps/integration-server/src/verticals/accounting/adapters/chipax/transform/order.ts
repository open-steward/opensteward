import { toCalendarDate } from '../../shared/transform'
import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem, Address } from '../../../schema/shared'

export interface ChipaxOrderRow {
  id: number
  productoId: string
  descripcion: string
  precioUnitario: number
  cantidad: number
  total: number
  impuesto: number
  cuentaId: string
  descuento: number
  [key: string]: unknown
}

export interface ChipaxOrder {
  id: number
  clienteId: number
  clienteNombre: string
  moneda: string
  total: number
  fechaPedido: string
  estado: string
  direccionDespacho: string
  ciudadDespacho: string
  comunaDespacho: string
  paisDespacho: string
  direccionFacturacion: string
  ciudadFacturacion: string
  comunaFacturacion: string
  paisFacturacion: string
  lineas: ChipaxOrderRow[]
  [key: string]: unknown
}

function mapStatus(status: string): OrderStatus {
  if (status === 'completado' || status === 'facturado') return 'COMPLETED'
  if (status === 'cancelado' || status === 'anulado') return 'CANCELLED'
  return 'ACTIVE'
}

function mapLineitem(row: ChipaxOrderRow): Lineitem {
  return {
    id: String(row.id),
    accountId: row.cuentaId || undefined,
    itemId: row.productoId || undefined,
    itemDescription: row.descripcion || undefined,
    unitAmount: row.precioUnitario,
    unitQuantity: row.cantidad,
    totalAmount: row.total,
    taxAmount: row.impuesto,
    discountAmount: row.descuento || undefined,
  }
}

function mapShippingAddress(raw: ChipaxOrder): Address | undefined {
  if (!raw.direccionDespacho && !raw.ciudadDespacho) return undefined
  return {
    address1: raw.direccionDespacho || undefined,
    city: raw.ciudadDespacho || undefined,
    region: raw.comunaDespacho || undefined,
    country: raw.paisDespacho || undefined,
  }
}

function mapBillingAddress(raw: ChipaxOrder): Address | undefined {
  if (!raw.direccionFacturacion && !raw.ciudadFacturacion) return undefined
  return {
    address1: raw.direccionFacturacion || undefined,
    city: raw.ciudadFacturacion || undefined,
    region: raw.comunaFacturacion || undefined,
    country: raw.paisFacturacion || undefined,
  }
}

export function transformOrder(raw: ChipaxOrder): Order {
  return {
    id: String(raw.id),
    status: mapStatus(raw.estado),
    type: 'SALES',
    contactId: raw.clienteId ? String(raw.clienteId) : undefined,
    currency: raw.moneda || undefined,
    totalAmount: raw.total,
    lineItems: (raw.lineas ?? []).map(mapLineitem),
    billingAddress: mapBillingAddress(raw),
    shippingAddress: mapShippingAddress(raw),
    postedAt: raw.fechaPedido ? new Date(raw.fechaPedido) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformOrder(order: Partial<Order>): Record<string, unknown> {
  return {
    clienteId: order.contactId ? Number(order.contactId) : undefined,
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
