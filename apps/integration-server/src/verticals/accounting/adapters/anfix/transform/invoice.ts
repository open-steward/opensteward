import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface AnfixInvoiceRow {
  id: number
  descripcion: string
  precio: number
  cantidad: number
  total: number
  iva: number
  cuenta: string
  [key: string]: unknown
}

export interface AnfixInvoice {
  id: string
  numero_factura: string
  fecha_factura: string
  fecha_vencimiento: string
  base_imponible: number
  cuota_iva: number
  total_factura: number
  pendiente: number
  estado: string
  cliente_id: string
  divisa: string
  lineas: AnfixInvoiceRow[]
  [key: string]: unknown
}

function mapStatus(estado: string): InvoiceStatus {
  switch (estado) {
    case 'emitida': return 'AUTHORIZED'
    case 'cobrada': return 'PAID'
    case 'anulada': return 'VOIDED'
    default: return 'DRAFT'
  }
}

function mapLineitem(row: AnfixInvoiceRow): Lineitem {
  return {
    id: String(row.id),
    accountId: row.cuenta || undefined,
    itemDescription: row.descripcion || undefined,
    unitAmount: row.precio,
    unitQuantity: row.cantidad,
    totalAmount: row.total,
    taxAmount: row.iva,
  }
}

export function transformInvoice(raw: AnfixInvoice): Invoice {
  return {
    id: raw.id,
    type: 'INVOICE',
    status: mapStatus(raw.estado),
    invoiceNumber: raw.numero_factura || undefined,
    contactId: raw.cliente_id || undefined,
    currency: raw.divisa || undefined,
    totalAmount: raw.total_factura,
    taxAmount: raw.cuota_iva,
    balanceAmount: raw.pendiente,
    lineItems: (raw.lineas ?? []).map(mapLineitem),
    postedAt: raw.fecha_factura ? new Date(raw.fecha_factura) : undefined,
    dueAt: raw.fecha_vencimiento ? new Date(raw.fecha_vencimiento) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
