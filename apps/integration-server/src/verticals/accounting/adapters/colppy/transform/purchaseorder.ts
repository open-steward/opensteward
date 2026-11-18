import { toCalendarDate } from '../../shared/transform'
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem, Address } from '../../../schema/shared'

export interface ColppyPurchaseOrderRow {
  idItem: number
  codigoArticulo: string
  descripcion: string
  precioUnitario: number
  cantidad: number
  total: number
  idCuenta: number
  [key: string]: unknown
}

export interface ColppyPurchaseOrder {
  idOrdenCompra: number
  idProveedor: number
  nombreProveedor: string
  moneda: string
  total: number
  fechaOrden: string
  estado: string
  direccionEntrega: string
  ciudadEntrega: string
  codigoPostalEntrega: string
  paisEntrega: string
  referenciaNuestra: string
  referenciaSuya: string
  items: ColppyPurchaseOrderRow[]
  [key: string]: unknown
}

function mapStatus(status: string): PurchaseOrderStatus {
  if (status === 'recibido') return 'COMPLETED'
  if (status === 'cancelado') return 'CANCELLED'
  return 'ACTIVE'
}

function mapLineitem(row: ColppyPurchaseOrderRow): Lineitem {
  return {
    id: String(row.idItem),
    accountId: row.idCuenta ? String(row.idCuenta) : undefined,
    itemId: row.codigoArticulo || undefined,
    itemDescription: row.descripcion || undefined,
    unitAmount: row.precioUnitario,
    unitQuantity: row.cantidad,
    totalAmount: row.total,
  }
}

function mapShippingAddress(raw: ColppyPurchaseOrder): Address | undefined {
  if (!raw.direccionEntrega && !raw.ciudadEntrega) return undefined
  return {
    address1: raw.direccionEntrega || undefined,
    city: raw.ciudadEntrega || undefined,
    postalCode: raw.codigoPostalEntrega || undefined,
    country: raw.paisEntrega || undefined,
  }
}

export function transformPurchaseOrder(raw: ColppyPurchaseOrder): PurchaseOrder {
  return {
    id: String(raw.idOrdenCompra),
    status: mapStatus(raw.estado),
    contactId: raw.idProveedor ? String(raw.idProveedor) : undefined,
    currency: raw.moneda || undefined,
    totalAmount: raw.total,
    lineItems: (raw.items ?? []).map(mapLineitem),
    shippingAddress: mapShippingAddress(raw),
    postedAt: raw.fechaOrden ? new Date(raw.fechaOrden) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformPurchaseOrder(
  order: Partial<PurchaseOrder>,
): Record<string, unknown> {
  return {
    idProveedor: order.contactId ? Number(order.contactId) : undefined,
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
