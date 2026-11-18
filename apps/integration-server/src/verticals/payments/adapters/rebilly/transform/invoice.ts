/**
 * Rebilly invoice → canonical Invoice (components/schemas/Invoice.yaml).
 * `status` enum: draft, quotation, unpaid, paid, partially-paid, past-due,
 * abandoned, voided, partially-refunded, refunded, disputed. Money fields
 * (`amount`, `amountDue`, `subtotalAmount`) are `type: number, x-type: Money`
 * in the invoice `currency`.
 */
import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import { optionalMinor, requireId, requireMoney, str } from './shared'

export interface RawRebillyInvoice {
  id?: string
  invoiceNumber?: number
  customerId?: string
  subscriptionId?: string | null
  currency?: string
  amount?: number
  amountDue?: number
  subtotalAmount?: number
  status?: string
  dueTime?: string
  paidTime?: string | null
  createdTime?: string
  updatedTime?: string
  [k: string]: unknown
}

function mapStatus(s: string | undefined): InvoiceStatus {
  switch (s) {
    case 'draft':
      return 'draft'
    case 'unpaid':
    case 'partially-paid':
    case 'past-due':
      return 'open'
    case 'paid':
      return 'paid'
    case 'voided':
      return 'void'
    case 'abandoned':
      return 'uncollectible'
    default:
      return 'unknown'
  }
}

export function transformInvoice(raw: RawRebillyInvoice): Invoice {
  const id = requireId(raw.id, 'invoice id')
  const money = requireMoney(raw.amount, raw.currency, `invoice ${id}`)
  return {
    id,
    externalId: id,
    number: typeof raw.invoiceNumber === 'number' ? String(raw.invoiceNumber) : undefined,
    customerId: str(raw.customerId),
    subscriptionId: str(raw.subscriptionId),
    status: mapStatus(raw.status),
    currency: money.currency,
    subtotal: optionalMinor(raw.subtotalAmount, money.currency),
    total: money.amount,
    amountDue: optionalMinor(raw.amountDue, money.currency),
    dueDate: str(raw.dueTime),
    paidAt: str(raw.paidTime),
    gateway: 'rebilly',
    // Invoice.yaml declares no customFields; the canonical record requires a map.
    metadata: {},
    createdAt: str(raw.createdTime),
    updatedAt: str(raw.updatedTime),
    raw,
  }
}
