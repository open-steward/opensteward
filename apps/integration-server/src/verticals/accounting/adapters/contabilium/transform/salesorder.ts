import { toCalendarDate } from '../../shared/transform'
import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem, Address } from '../../../schema/shared'

export interface ContabiliumSalesOrderItem {
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

export interface ContabiliumSalesOrder {
  id: number
  clienteId: number
  clienteNombre: string
  moneda: string
  total: number
  fecha: string
  estado: string
  direccionEnvio: string
  localidadEnvio: string
  provinciaEnvio: string
  paisEnvio: string
  direccionFacturacion: string
  localidadFacturacion: string
  provinciaFacturacion: string
  paisFacturacion: string
  items: ContabiliumSalesOrderItem[]
  [key: string]: unknown
}

function mapStatus(status: string): SalesOrderStatus {
  if (status === 'Completado' || status === 'Facturado') return 'COMPLETED'
  if (status === 'Cancelado' || status === 'Anulado') return 'CANCELLED'
  return 'ACTIVE'
}

function mapLineitem(row: ContabiliumSalesOrderItem): Lineitem {
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

function mapShippingAddress(raw: ContabiliumSalesOrder): Address | undefined {
  if (!raw.direccionEnvio && !raw.localidadEnvio) return undefined
  return {
    address1: raw.direccionEnvio || undefined,
    city: raw.localidadEnvio || undefined,
    region: raw.provinciaEnvio || undefined,
    country: raw.paisEnvio || undefined,
  }
}

function mapBillingAddress(raw: ContabiliumSalesOrder): Address | undefined {
  if (!raw.direccionFacturacion && !raw.localidadFacturacion) return undefined
  return {
    address1: raw.direccionFacturacion || undefined,
    city: raw.localidadFacturacion || undefined,
    region: raw.provinciaFacturacion || undefined,
    country: raw.paisFacturacion || undefined,
  }
}

export function transformSalesOrder(raw: ContabiliumSalesOrder): SalesOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw.estado),
    contactId: raw.clienteId ? String(raw.clienteId) : undefined,
    currency: raw.moneda || undefined,
    totalAmount: raw.total,
    lineItems: (raw.items ?? []).map(mapLineitem),
    billingAddress: mapBillingAddress(raw),
    shippingAddress: mapShippingAddress(raw),
    postedAt: raw.fecha ? new Date(raw.fecha) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformSalesOrder(order: Partial<SalesOrder>): Record<string, unknown> {
  return {
    clienteId: order.contactId ? Number(order.contactId) : undefined,
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
