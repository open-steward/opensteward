import { toIsoDatetime } from '@opensteward/shared'
import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import { CURRENCY } from '../constants'
import { intOrUndefined, requireId, strOrUndefined, tagsMetadata } from './shared'

/**
 * Stark Bank Invoice, as `GET /v2/invoice` ("invoices") and
 * `GET /v2/invoice/:id` ("invoice") return it.
 * Docs: https://docs.starkbank.com/api (The Invoice object).
 */
export interface RawStarkBankInvoice {
  id?: string
  /** "Amount in cents that was received." — updated to the amount actually paid. */
  amount?: number
  /** "Invoice amount in cents without fine or interest." */
  nominalAmount?: number
  fee?: number
  status?: string
  name?: string
  /** "Payer CPF or CNPJ." */
  taxId?: string
  link?: string
  pdf?: string
  due?: string
  created?: string
  updated?: string
  tags?: string[]
  [k: string]: unknown
}

/**
 * "status STRING Current invoice status. Options: "created", "paid",
 * "canceled", "overdue", "expired"." The status diagram adds "voided".
 * An overdue invoice can still be paid until it expires ("After expiration,
 * the invoice cannot be paid anymore"), so overdue stays open and expired is
 * uncollectible.
 */
function mapStatus(s: unknown): InvoiceStatus {
  switch (s) {
    case 'created':
    case 'overdue':
      return 'open'
    case 'paid':
      return 'paid'
    case 'canceled':
    case 'voided':
      return 'void'
    case 'expired':
      return 'uncollectible'
    default:
      return 'unknown'
  }
}

export function transformInvoice(raw: RawStarkBankInvoice): Invoice {
  const id = requireId(raw, 'invoice')
  const amount = intOrUndefined(raw.amount)
  if (amount === undefined) throw new Error(`Stark Bank invoice ${id} has no amount`)
  const status = mapStatus(raw.status)
  return {
    id,
    externalId: id,
    customerId: strOrUndefined(raw.taxId),
    status,
    currency: CURRENCY,
    subtotal: intOrUndefined(raw.nominalAmount),
    total: amount,
    amountPaid: status === 'paid' ? amount : undefined,
    dueDate: toIsoDatetime(raw.due),
    hostedInvoiceUrl: strOrUndefined(raw.link),
    invoicePdfUrl: strOrUndefined(raw.pdf),
    gateway: 'stark-bank',
    metadata: tagsMetadata(raw.tags),
    createdAt: toIsoDatetime(raw.created),
    updatedAt: toIsoDatetime(raw.updated),
    raw,
  }
}
