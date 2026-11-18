import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface MoyskladInvoiceLine {
  id?: string
  description?: string
  price?: number
  quantity?: number
  sum?: number
  vat?: number
  account?: { meta?: { href?: string } }
  [key: string]: unknown
}

export interface MoyskladInvoice {
  id?: string
  name?: string
  moment?: string
  paymentPlannedMoment?: string
  sum?: number
  vatSum?: number
  applicable?: boolean
  counterparty?: { meta?: { href?: string } }
  currency?: { name?: string }
  positions?: { rows?: MoyskladInvoiceLine[] }
  [key: string]: unknown
}

function mapStatus(applicable?: boolean): InvoiceStatus {
  if (applicable === true) return 'AUTHORIZED'
  return 'DRAFT'
}

function getLastSegment(href?: string): string | undefined {
  if (!href) return undefined
  const parts = href.split('/')
  return parts[parts.length - 1] || undefined
}

export function transformInvoice(raw: MoyskladInvoice): Invoice {
  return {
    id: raw.id ? String(raw.id) : undefined,
    type: 'INVOICE',
    status: mapStatus(raw.applicable),
    invoiceNumber: raw.name || undefined,
    contactId: getLastSegment(raw.counterparty?.meta?.href),
    currency: raw.currency?.name || undefined,
    totalAmount: raw.sum != null ? raw.sum / 100 : undefined,
    taxAmount: raw.vatSum != null ? raw.vatSum / 100 : undefined,
    balanceAmount: raw.sum != null ? raw.sum / 100 : undefined,
    postedAt: raw.moment ? new Date(raw.moment) : undefined,
    dueAt: raw.paymentPlannedMoment ? new Date(raw.paymentPlannedMoment) : undefined,
    lineItems: (raw.positions?.rows ?? []).map(l => ({
      id: l.id ? String(l.id) : undefined,
      itemDescription: l.description || undefined,
      unitAmount: l.price != null ? l.price / 100 : undefined,
      unitQuantity: l.quantity,
      totalAmount: l.sum != null ? l.sum / 100 : undefined,
      taxAmount: l.vat != null ? l.vat / 100 : undefined,
      accountId: getLastSegment(l.account?.meta?.href),
    } satisfies Lineitem)),
    metadata: raw as Record<string, unknown>,
  }
}
