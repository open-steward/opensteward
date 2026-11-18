import { toCalendarDate } from '../../shared/transform'
import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem, Address } from '../../../schema/shared'

export interface ColppyOrderRow {
  idItem: number
  codigoArticulo: string
  descripcion: string
  precioUnitario: number
  cantidad: number
  total: number
  iva: number
  idCuenta: number
  descuento: number
  [key: string]: unknown
}

export interface ColppyOrder {
  idPedido: number
  idCliente: number
  nombreCliente: string
  moneda: string
  total: number
  fechaPedido: string
  estado: string
  direccionEntrega: string
  ciudadEntrega: string
  codigoPostalEntrega: string
  paisEntrega: string
  direccionFacturacion: string
  ciudadFacturacion: string
  codigoPostalFacturacion: string
  paisFacturacion: string
  items: ColppyOrderRow[]
  [key: string]: unknown
}

function mapStatus(status: string): OrderStatus {
  if (status === 'facturado') return 'COMPLETED'
  if (status === 'cancelado') return 'CANCELLED'
  return 'ACTIVE'
}

function mapLineitem(row: ColppyOrderRow): Lineitem {
  return {
    id: String(row.idItem),
    accountId: row.idCuenta ? String(row.idCuenta) : undefined,
    itemId: row.codigoArticulo || undefined,
    itemDescription: row.descripcion || undefined,
    unitAmount: row.precioUnitario,
    unitQuantity: row.cantidad,
    totalAmount: row.total,
    taxAmount: row.iva,
    discountAmount: row.descuento || undefined,
  }
}

function mapShippingAddress(raw: ColppyOrder): Address | undefined {
  if (!raw.direccionEntrega && !raw.ciudadEntrega) return undefined
  return {
    address1: raw.direccionEntrega || undefined,
    city: raw.ciudadEntrega || undefined,
    postalCode: raw.codigoPostalEntrega || undefined,
    country: raw.paisEntrega || undefined,
  }
}

function mapBillingAddress(raw: ColppyOrder): Address | undefined {
  if (!raw.direccionFacturacion && !raw.ciudadFacturacion) return undefined
  return {
    address1: raw.direccionFacturacion || undefined,
    city: raw.ciudadFacturacion || undefined,
    postalCode: raw.codigoPostalFacturacion || undefined,
    country: raw.paisFacturacion || undefined,
  }
}

export function transformOrder(raw: ColppyOrder): Order {
  return {
    id: String(raw.idPedido),
    status: mapStatus(raw.estado),
    type: 'SALES',
    contactId: raw.idCliente ? String(raw.idCliente) : undefined,
    currency: raw.moneda || undefined,
    totalAmount: raw.total,
    lineItems: (raw.items ?? []).map(mapLineitem),
    billingAddress: mapBillingAddress(raw),
    shippingAddress: mapShippingAddress(raw),
    postedAt: raw.fechaPedido ? new Date(raw.fechaPedido) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformOrder(order: Partial<Order>): Record<string, unknown> {
  return {
    idCliente: order.contactId ? Number(order.contactId) : undefined,
    moneda: order.currency,
    fechaPedido: toCalendarDate(order.postedAt),
    items: order.lineItems?.map((li) => ({
      codigoArticulo: li.itemId,
      descripcion: li.itemDescription,
      precioUnitario: li.unitAmount,
      cantidad: li.unitQuantity,
      idCuenta: li.accountId ? Number(li.accountId) : undefined,
    })),
  }
}
