import { toCalendarDate } from '../../shared/transform'
import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface ContabiliumInvoiceItem {
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

export interface ContabiliumInvoice {
  id: number
  numero: string
  clienteId: number
  clienteNombre: string
  fechaEmision: string
  fechaVencimiento: string
  total: number
  impuestos: number
  saldo: number
  moneda: string
  estado: string
  anulado: boolean
  montoPagado: number
  referencia: string
  items: ContabiliumInvoiceItem[]
  [key: string]: unknown
}

function mapStatus(inv: ContabiliumInvoice): InvoiceStatus {
  if (inv.anulado) return 'VOIDED'
  if (inv.estado === 'Pagado' || inv.saldo === 0) return 'PAID'
  if (inv.saldo > 0 && inv.saldo < inv.total) return 'PARTIALLY_PAID'
  if (inv.estado === 'Autorizado') return 'AUTHORIZED'
  return 'DRAFT'
}

function mapLineitem(row: ContabiliumInvoiceItem): Lineitem {
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

export function transformInvoice(raw: ContabiliumInvoice): Invoice {
  return {
    id: String(raw.id),
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: raw.numero || undefined,
    contactId: raw.clienteId ? String(raw.clienteId) : undefined,
    currency: raw.moneda || undefined,
    totalAmount: raw.total,
    taxAmount: raw.impuestos,
    balanceAmount: raw.saldo,
    paidAmount: raw.montoPagado || undefined,
    reference: raw.referencia || undefined,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.fechaEmision ? new Date(raw.fechaEmision) : undefined,
    dueAt: raw.fechaVencimiento ? new Date(raw.fechaVencimiento) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformInvoice(invoice: Partial<Invoice>): Record<string, unknown> {
  return {
    clienteId: invoice.contactId ? Number(invoice.contactId) : undefined,
    moneda: invoice.currency,
    fechaEmision: toCalendarDate(invoice.postedAt),
    fechaVencimiento: toCalendarDate(invoice.dueAt),
    referencia: invoice.reference,
    items: invoice.lineItems?.map((li) => ({
      productoId: li.itemId,
      descripcion: li.itemDescription,
      precioUnitario: li.unitAmount,
      cantidad: li.unitQuantity,
      cuentaId: li.accountId,
    })),
  }
}
