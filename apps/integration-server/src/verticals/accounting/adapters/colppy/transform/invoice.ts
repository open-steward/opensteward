import { toCalendarDate } from '../../shared/transform'
import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface ColppyInvoiceRow {
  idItem: number
  codigoArticulo: string
  descripcion: string
  precioUnitario: number
  cantidad: number
  total: number
  iva: number
  idCuenta: number
  descuento: number
  unidad: string
  [key: string]: unknown
}

export interface ColppyInvoice {
  idFactura: number
  nroFactura: string
  idCliente: number
  nombreCliente: string
  fechaEmision: string
  fechaVencimiento: string
  total: number
  totalIva: number
  saldo: number
  moneda: string
  contabilizada: boolean
  anulada: boolean
  enviada: boolean
  items: ColppyInvoiceRow[]
  referenciaExterna: string
  montoPagado: number
  [key: string]: unknown
}

function mapStatus(inv: ColppyInvoice): InvoiceStatus {
  if (inv.anulada) return 'VOIDED'
  if (inv.contabilizada && inv.saldo === 0) return 'PAID'
  if (inv.contabilizada && inv.saldo > 0 && inv.saldo < inv.total) return 'PARTIALLY_PAID'
  if (inv.contabilizada) return 'AUTHORIZED'
  return 'DRAFT'
}

function mapLineitem(row: ColppyInvoiceRow): Lineitem {
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

export function transformInvoice(raw: ColppyInvoice): Invoice {
  return {
    id: String(raw.idFactura),
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: raw.nroFactura,
    contactId: raw.idCliente ? String(raw.idCliente) : undefined,
    currency: raw.moneda || undefined,
    totalAmount: raw.total,
    taxAmount: raw.totalIva,
    balanceAmount: raw.saldo,
    paidAmount: raw.montoPagado || undefined,
    reference: raw.referenciaExterna || undefined,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.fechaEmision ? new Date(raw.fechaEmision) : undefined,
    dueAt: raw.fechaVencimiento ? new Date(raw.fechaVencimiento) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformInvoice(invoice: Partial<Invoice>): Record<string, unknown> {
  return {
    idCliente: invoice.contactId ? Number(invoice.contactId) : undefined,
    moneda: invoice.currency,
    fechaEmision: toCalendarDate(invoice.postedAt),
    fechaVencimiento: toCalendarDate(invoice.dueAt),
    referenciaExterna: invoice.reference,
    items: invoice.lineItems?.map((li) => ({
      codigoArticulo: li.itemId,
      descripcion: li.itemDescription,
      precioUnitario: li.unitAmount,
      cantidad: li.unitQuantity,
      idCuenta: li.accountId ? Number(li.accountId) : undefined,
    })),
  }
}
