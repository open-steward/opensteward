import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface ContasimpleInvoiceRow {
  id: number
  descripcion: string
  precio: number
  cantidad: number
  total: number
  iva: number
  cuenta: string
  [key: string]: unknown
}

export interface ContasimpleInvoice {
  id: string
  numero: string
  fecha: string
  fecha_vencimiento: string
  base: number
  iva: number
  total: number
  pendiente: number
  estado: string
  cliente_id: string
  moneda: string
  lineas: ContasimpleInvoiceRow[]
  [key: string]: unknown
}

function mapStatus(estado: string): InvoiceStatus {
  switch (estado) {
    case 'enviada': return 'AUTHORIZED'
    case 'pagada': return 'PAID'
    case 'cancelada': return 'VOIDED'
    default: return 'DRAFT'
  }
}

function mapLineitem(row: ContasimpleInvoiceRow): Lineitem {
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

export function transformInvoice(raw: ContasimpleInvoice): Invoice {
  return {
    id: raw.id,
    type: 'INVOICE',
    status: mapStatus(raw.estado),
    invoiceNumber: raw.numero || undefined,
    contactId: raw.cliente_id || undefined,
    currency: raw.moneda || undefined,
    totalAmount: raw.total,
    taxAmount: raw.iva,
    balanceAmount: raw.pendiente,
    lineItems: (raw.lineas ?? []).map(mapLineitem),
    postedAt: raw.fecha ? new Date(raw.fecha) : undefined,
    dueAt: raw.fecha_vencimiento ? new Date(raw.fecha_vencimiento) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
