import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface NetSuiteInvoiceItem {
  item: { id: string }
  description: string
  quantity: number
  rate: number
  amount: number
}

export interface NetSuiteInvoice {
  id: string
  tranId: string
  entity: { id: string; refName: string }
  tranDate: string
  dueDate: string
  total: number
  amountRemaining: number
  taxTotal: number
  currency: { id: string; refName: string }
  status: { id: string; refName: string }
  item?: NetSuiteInvoiceItem[]
  [key: string]: unknown
}

const ISO_4217 = /^[A-Z]{3}$/

/**
 * NetSuite returns the currency as a record reference, and *neither* member is
 * dependably an ISO 4217 code. `id` is the currency record's internal ID (e.g.
 * `'1'`). `refName` is its display name — usually the code, because that is how
 * most accounts name their currency records, but `'US Dollar'` and localised
 * names are equally legal, and a renamed record breaks the assumption silently.
 *
 * Canonical `Invoice.currency` is validated as `/^[A-Z]{3}$/`, so emit `refName`
 * only when it genuinely is a code, and drop it otherwise. An absent optional
 * field is a far better failure than an invalid one: nothing downstream
 * re-validates, because the routers `safeParse` request bodies only, never
 * responses — so a bad value would reach API consumers unchallenged.
 *
 * The complete fix is to resolve id -> code from the currency record's `symbol`
 * via `record/v1/currency/{id}`, cached per connection. Tracked in
 * `docs/architecture/transform-conformance.md`.
 */
function mapCurrency(raw: NetSuiteInvoice): string | undefined {
  const refName = raw.currency?.refName
  return refName && ISO_4217.test(refName) ? refName : undefined
}

function mapStatus(raw: NetSuiteInvoice): InvoiceStatus {
  switch (raw.status.id) {
    case 'A':
      return 'AUTHORIZED'
    case 'B':
      return 'PARTIALLY_PAID'
    case 'C':
      return 'PAID'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(item: NetSuiteInvoiceItem): Lineitem {
  return {
    id: item.item.id,
    itemId: item.item.id || undefined,
    itemDescription: item.description || undefined,
    unitAmount: item.rate,
    unitQuantity: item.quantity,
    totalAmount: item.amount,
  }
}

export function transformInvoice(raw: NetSuiteInvoice): Invoice {
  return {
    id: raw.id,
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: raw.tranId || undefined,
    contactId: raw.entity.id || undefined,
    currency: mapCurrency(raw),
    totalAmount: raw.total,
    taxAmount: raw.taxTotal,
    balanceAmount: raw.amountRemaining,
    lineItems: (raw.item ?? []).map(mapLineitem),
    postedAt: raw.tranDate ? new Date(raw.tranDate) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
