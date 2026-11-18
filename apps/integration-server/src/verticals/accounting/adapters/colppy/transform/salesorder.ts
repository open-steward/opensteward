import { toCalendarDate } from '../../shared/transform'
import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem, Address } from '../../../schema/shared'

export interface ColppySalesOrderRow {
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

export interface ColppySalesOrder {
  idOrdenVenta: number
  idCliente: number
  nombreCliente: string
  moneda: string
  total: number
  fechaOrden: string
  estado: string
  direccionEntrega: string
  ciudadEntrega: string
  codigoPostalEntrega: string
  paisEntrega: string
  direccionFacturacion: string
  ciudadFacturacion: string
  codigoPostalFacturacion: string
  paisFacturacion: string
  items: ColppySalesOrderRow[]
  [key: string]: unknown
}

function mapStatus(status: string): SalesOrderStatus {
  if (status === 'facturado') return 'COMPLETED'
  if (status === 'cancelado') return 'CANCELLED'
  return 'ACTIVE'
}

function mapLineitem(row: ColppySalesOrderRow): Lineitem {
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

function mapShippingAddress(raw: ColppySalesOrder): Address | undefined {
  if (!raw.direccionEntrega && !raw.ciudadEntrega) return undefined
  return {
    address1: raw.direccionEntrega || undefined,
    city: raw.ciudadEntrega || undefined,
    postalCode: raw.codigoPostalEntrega || undefined,
    country: raw.paisEntrega || undefined,
  }
}

function mapBillingAddress(raw: ColppySalesOrder): Address | undefined {
  if (!raw.direccionFacturacion && !raw.ciudadFacturacion) return undefined
  return {
    address1: raw.direccionFacturacion || undefined,
    city: raw.ciudadFacturacion || undefined,
    postalCode: raw.codigoPostalFacturacion || undefined,
    country: raw.paisFacturacion || undefined,
  }
}

export function transformSalesOrder(raw: ColppySalesOrder): SalesOrder {
  return {
    id: String(raw.idOrdenVenta),
    status: mapStatus(raw.estado),
    contactId: raw.idCliente ? String(raw.idCliente) : undefined,
    currency: raw.moneda || undefined,
    totalAmount: raw.total,
    lineItems: (raw.items ?? []).map(mapLineitem),
    billingAddress: mapBillingAddress(raw),
    shippingAddress: mapShippingAddress(raw),
    postedAt: raw.fechaOrden ? new Date(raw.fechaOrden) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformSalesOrder(order: Partial<SalesOrder>): Record<string, unknown> {
  return {
    idCliente: order.contactId ? Number(order.contactId) : undefined,
    moneda: order.currency,
    fechaOrden: toCalendarDate(order.postedAt),
    items: order.lineItems?.map((li) => ({
      codigoArticulo: li.itemId,
      descripcion: li.itemDescription,
      precioUnitario: li.unitAmount,
      cantidad: li.unitQuantity,
      idCuenta: li.accountId ? Number(li.accountId) : undefined,
    })),
  }
}
