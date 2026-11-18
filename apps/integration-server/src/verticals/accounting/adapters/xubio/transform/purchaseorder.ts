import { toCalendarDate } from '../../shared/transform'
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'

export interface XubioPurchaseOrderLine {
  id: number
  productoId: string
  descripcion: string
  cantidad: number
  precioUnitario: number
  total: number
  impuesto: number
  cuentaId: string
  [key: string]: unknown
}

export interface XubioPurchaseOrder {
  id: number
  numero: string
  proveedorId: number
  moneda: string
  fechaEmision: string
  estado: string
  total: number
  impuestos: number
  lineas: XubioPurchaseOrderLine[]
  [key: string]: unknown
}

function mapStatus(estado: string): PurchaseOrderStatus {
  if (estado === 'recibido' || estado === 'completado') return 'COMPLETED'
  if (estado === 'cancelado' || estado === 'anulado') return 'CANCELLED'
  if (estado === 'borrador') return 'DRAFT'
  return 'ACTIVE'
}

function mapLineitem(row: XubioPurchaseOrderLine): Lineitem {
  return {
    id: String(row.id),
    accountId: row.cuentaId || undefined,
    itemId: row.productoId || undefined,
    itemDescription: row.descripcion || undefined,
    unitAmount: row.precioUnitario,
    unitQuantity: row.cantidad,
    totalAmount: row.total,
    taxAmount: row.impuesto || undefined,
  }
}

export function transformPurchaseOrder(raw: XubioPurchaseOrder): PurchaseOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw.estado),
    contactId: raw.proveedorId ? String(raw.proveedorId) : undefined,
    currency: raw.moneda || undefined,
    totalAmount: raw.total,
    lineItems: (raw.lineas ?? []).map(mapLineitem),
    postedAt: raw.fechaEmision ? new Date(raw.fechaEmision) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformPurchaseOrder(order: Partial<PurchaseOrder>): Record<string, unknown> {
  return {
    proveedorId: order.contactId ? Number(order.contactId) : undefined,
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
