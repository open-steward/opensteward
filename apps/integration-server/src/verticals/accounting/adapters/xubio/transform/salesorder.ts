import { toCalendarDate } from '../../shared/transform'
import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem } from '../../../schema/shared'

export interface XubioSalesOrderLine {
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

export interface XubioSalesOrder {
  id: number
  numero: string
  clienteId: number
  moneda: string
  fechaEmision: string
  estado: string
  total: number
  impuestos: number
  lineas: XubioSalesOrderLine[]
  [key: string]: unknown
}

function mapStatus(estado: string): SalesOrderStatus {
  if (estado === 'completado' || estado === 'facturado') return 'COMPLETED'
  if (estado === 'cancelado' || estado === 'anulado') return 'CANCELLED'
  if (estado === 'borrador') return 'DRAFT'
  return 'ACTIVE'
}

function mapLineitem(row: XubioSalesOrderLine): Lineitem {
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

export function transformSalesOrder(raw: XubioSalesOrder): SalesOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw.estado),
    contactId: raw.clienteId ? String(raw.clienteId) : undefined,
    currency: raw.moneda || undefined,
    totalAmount: raw.total,
    lineItems: (raw.lineas ?? []).map(mapLineitem),
    postedAt: raw.fechaEmision ? new Date(raw.fechaEmision) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformSalesOrder(order: Partial<SalesOrder>): Record<string, unknown> {
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
