import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import { pickCurrency, strMap, toIsoDatetime, toMinorUnits } from './shared'

/**
 * A BillDesk Invoice is a debit instruction issued within a mandate (recurring
 * payment authorisation) and maps onto the canonical Invoice resource.
 *
 * Confirmed request/response fields from BillDesk docs
 * (https://docs.billdesk.io/reference/createinvoice,
 *  https://docs.billdesk.io/reference/retriveinvoice):
 *
 *   invoice_number         — merchant-assigned invoice identifier (used as id)
 *   invoice_display_number — human-readable display number
 *   subscription_refid     — merchant's subscription/mandate reference
 *   mandateid              — BillDesk mandate id this invoice belongs to
 *   invoice_date           — generation date (YYYYMMDD)
 *   duedate                — payment deadline (YYYYMMDD)
 *   debit_date             — SI execution date (YYYYMMDD)
 *   amount                 — major-unit decimal string (e.g. "299.00")
 *   currency               — ISO 4217 numeric code (e.g. "356")
 *   status                 — "unpaid" | "paid" | "failed" | "cancelled"
 *
 * Endpoint: POST /pgsi/ve1_2/invoices/create
 *           POST /pgsi/ve1_2/invoices/get  (retrieve by invoice_number + mercid)
 */
export interface RawBilldeskInvoice {
  invoice_number?: string
  invoice_display_number?: string
  subscription_refid?: string
  mandateid?: string
  mercid?: string
  invoice_date?: string
  duedate?: string
  debit_date?: string
  amount?: string
  currency?: string
  status?: string
  verification_error_code?: string
  verification_error_type?: string
  verification_error_desc?: string
  [k: string]: unknown
}

/**
 * Map BillDesk invoice `status` → canonical InvoiceStatus.
 * BillDesk statuses: "unpaid" | "paid" | "failed" | "cancelled".
 */
function mapStatus(raw: string | undefined): InvoiceStatus {
  switch ((raw ?? '').toLowerCase()) {
    case 'paid':
      return 'paid'
    case 'cancelled':
    case 'canceled':
      return 'void'
    case 'failed':
      return 'uncollectible'
    case 'unpaid':
    default:
      return 'open'
  }
}

export function transformInvoice(raw: RawBilldeskInvoice): Invoice {
  const id = String(raw.invoice_number ?? '')
  const status = mapStatus(raw.status)
  const amount = toMinorUnits(raw.amount)
  const currency = pickCurrency(raw.currency)
  const createdAt = toIsoDatetime(raw.invoice_date)
  const dueDate = toIsoDatetime(raw.duedate)
  const paidAt = status === 'paid' ? toIsoDatetime(raw.debit_date ?? raw.duedate) : undefined

  return {
    id,
    externalId: id,
    number: raw.invoice_display_number ?? raw.invoice_number,
    subscriptionId: raw.mandateid,
    status,
    currency,
    total: amount,
    amountDue: status === 'paid' ? 0 : amount,
    amountPaid: status === 'paid' ? amount : 0,
    amountRemaining: status === 'paid' ? 0 : amount,
    dueDate,
    paidAt,
    gateway: 'billdesk',
    metadata: strMap({
      mercid: raw.mercid,
      mandateid: raw.mandateid,
      subscription_refid: raw.subscription_refid,
      debit_date: raw.debit_date,
      verification_error_code: raw.verification_error_code,
      verification_error_type: raw.verification_error_type,
    }),
    createdAt,
    updatedAt: createdAt,
    raw,
  }
}
