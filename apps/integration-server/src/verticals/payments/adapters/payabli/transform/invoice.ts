import { majorToMinor, toIsoDatetime } from '@opensteward/shared'
import type { Invoice, InvoiceStatus } from '../../../schema/invoice'

/**
 * A row of GET /Query/invoices/{entry}, also the body of GET
 * /Invoice/{idInvoice}. Only the fields read here. Neither documents a
 * currency field, so the currency comes from the connection.
 * https://docs.payabli.com/developers/api-reference/invoice/get-list-of-invoices-for-an-entrypoint.md
 */
export interface RawPayabliInvoice {
  /** "Identifier of invoice." */
  invoiceId?: number | null
  /** "The Payabli-generated unique ID for the customer." */
  customerId?: number | null
  invoiceNumber?: string | null
  invoiceDueDate?: string | null
  /** "Timestamp of when record was created, in UTC." */
  createdAt?: string | null
  /** "Invoice status code." */
  invoiceStatus?: number | null
  /** "The invoice amount." */
  invoiceAmount?: number | null
  /** "Amount partially paid to the invoice." */
  invoicePaidAmount?: number | null
  [k: string]: unknown
}

/**
 * `invoiceStatus`, from "Invoice status"
 * (https://docs.payabli.com/developers/references/money-in-statuses.md):
 * 0 Draft, 1 Active/Open, 2 Partially Paid, 4 Paid/Complete, 99 Canceled.
 */
function mapStatus(s: number | null | undefined): InvoiceStatus {
  switch (s) {
    case 0:
      return 'draft'
    case 1:
    case 2:
      return 'open'
    case 4:
      return 'paid'
    case 99:
      return 'void'
    default:
      return 'unknown'
  }
}

export function transformInvoice(raw: RawPayabliInvoice, currency: string): Invoice {
  if (raw.invoiceId == null) throw new Error('Payabli invoice has no invoiceId')
  const id = String(raw.invoiceId)
  const total = majorToMinor(raw.invoiceAmount, currency)
  if (total === undefined) throw new Error(`Payabli invoice ${id} has no invoiceAmount`)
  return {
    id,
    externalId: id,
    number: raw.invoiceNumber || undefined,
    customerId: raw.customerId != null ? String(raw.customerId) : undefined,
    status: mapStatus(raw.invoiceStatus),
    currency,
    total,
    amountPaid: majorToMinor(raw.invoicePaidAmount, currency),
    dueDate: toIsoDatetime(raw.invoiceDueDate),
    gateway: 'payabli',
    metadata: {},
    createdAt: toIsoDatetime(raw.createdAt),
    raw,
  }
}
