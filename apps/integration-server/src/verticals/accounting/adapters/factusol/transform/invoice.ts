/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface FactusolInvoiceRow {
  id: number
  descripcion: string
  precio: number
  cantidad: number
  total: number
  importe_iva: number
  cuenta: string
  [key: string]: unknown
}

export interface FactusolInvoice {
  id: string
  numero: string
  fecha: string
  fecha_cobro: string
  importe_neto: number
  importe_iva: number
  importe_total: number
  importe_pendiente: number
  estado: number
  cliente_id: string
  divisa: string
  lineas: FactusolInvoiceRow[]
  [key: string]: unknown
}

function mapStatus(estado: number): InvoiceStatus {
  switch (estado) {
    case 1: return 'AUTHORIZED'
    case 2: return 'PAID'
    case 3: return 'VOIDED'
    default: return 'DRAFT'
  }
}

function mapLineitem(row: FactusolInvoiceRow): Lineitem {
  return {
    id: String(row.id),
    accountId: row.cuenta || undefined,
    itemDescription: row.descripcion || undefined,
    unitAmount: row.precio,
    unitQuantity: row.cantidad,
    totalAmount: row.total,
    taxAmount: row.importe_iva,
  }
}

export function transformInvoice(raw: FactusolInvoice): Invoice {
  return {
    id: raw.id,
    type: 'INVOICE',
    status: mapStatus(raw.estado),
    invoiceNumber: raw.numero || undefined,
    contactId: raw.cliente_id || undefined,
    currency: raw.divisa || undefined,
    totalAmount: raw.importe_total,
    taxAmount: raw.importe_iva,
    balanceAmount: raw.importe_pendiente,
    lineItems: (raw.lineas ?? []).map(mapLineitem),
    postedAt: raw.fecha ? new Date(raw.fecha) : undefined,
    dueAt: raw.fecha_cobro ? new Date(raw.fecha_cobro) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
