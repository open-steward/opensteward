import { toCalendarDate } from '../../shared/transform'
import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'
import { toIsoDatetime } from '@opensteward/shared'

/**
 * inFakt invoice (VAT invoice, kind: "vat").
 *
 * Amounts are in groszy (1 PLN = 100 groszy).
 * Status values: draft | sent | printed | paid
 * Identifier: uuid (string)
 */

export interface InfaktService {
  name: string
  tax_symbol: string | null
  unit: string | null
  quantity: number | null
  unit_net_price: number | null
  net_price: number | null
  gross_price: number | null
  tax_price: number | null
  discount: number | null
  pkwiu: string | null
  [key: string]: unknown
}

export interface InfaktInvoice {
  uuid: string
  number: string
  kind: string
  status: string
  currency: string
  invoice_date: string | null
  sale_date: string | null
  payment_date: string | null
  paid_date: string | null
  net_price: number | null
  tax_price: number | null
  gross_price: number | null
  left_to_pay: number | null
  client_id: number | null
  client_company_name: string | null
  client_tax_code: string | null
  notes: string | null
  payment_method: string | null
  services: InfaktService[]
  created_at: string | null
  [key: string]: unknown
}

function mapStatus(raw: InfaktInvoice): InvoiceStatus {
  switch (raw.status) {
    case 'paid':
      return 'PAID'
    case 'sent':
      return 'AUTHORIZED'
    case 'printed':
      return 'AUTHORIZED'
    case 'draft':
      return 'DRAFT'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(svc: InfaktService): Lineitem {
  return {
    itemName: svc.name || undefined,
    itemDescription: svc.name || undefined,
    unitAmount: svc.unit_net_price ?? undefined,
    unitQuantity: svc.quantity != null ? Math.round(svc.quantity) : undefined,
    totalAmount: svc.gross_price ?? undefined,
    taxAmount: svc.tax_price ?? undefined,
    discountAmount: svc.discount ?? undefined,
  }
}

export function transformInvoice(raw: InfaktInvoice): Invoice {
  const balanceAmount = raw.left_to_pay ?? undefined
  const totalAmount = raw.gross_price ?? undefined
  const paidAmount =
    totalAmount !== undefined && balanceAmount !== undefined
      ? totalAmount - balanceAmount
      : undefined

  return {
    id: raw.uuid,
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: raw.number || undefined,
    contactId: raw.client_id != null ? String(raw.client_id) : undefined,
    currency: raw.currency || undefined,
    totalAmount,
    taxAmount: raw.tax_price ?? undefined,
    balanceAmount,
    paidAmount,
    notes: raw.notes || undefined,
    lineItems: (raw.services ?? []).map(mapLineitem),
    postedAt: toIsoDatetime(raw.invoice_date) ? new Date(toIsoDatetime(raw.invoice_date)!) : undefined,
    dueAt: toIsoDatetime(raw.payment_date) ? new Date(toIsoDatetime(raw.payment_date)!) : undefined,
    paidAt: toIsoDatetime(raw.paid_date) ? new Date(toIsoDatetime(raw.paid_date)!) : undefined,
    createdAt: toIsoDatetime(raw.created_at) ? new Date(toIsoDatetime(raw.created_at)!) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

// Canonical Invoice → inFakt invoice body (for create/update)
export function untransformInvoice(invoice: Partial<Invoice>): Record<string, unknown> {
  return {
    kind: 'vat',
    client_id: invoice.contactId ? Number(invoice.contactId) : undefined,
    currency: invoice.currency,
    invoice_date: toCalendarDate(invoice.postedAt),
    payment_date: toCalendarDate(invoice.dueAt),
    notes: invoice.notes,
    services: invoice.lineItems?.map((li) => ({
      name: li.itemName ?? li.itemDescription,
      unit_net_price: li.unitAmount,
      quantity: li.unitQuantity,
      tax_symbol: null,
    })),
  }
}
