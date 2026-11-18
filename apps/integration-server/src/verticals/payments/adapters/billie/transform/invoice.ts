import { toIsoDatetime } from '@opensteward/shared'
import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import { grossMinor, pickCurrency, strMap, toMinorUnits, type TaxedMoney } from './shared'

/**
 * A Billie "invoice" (a.k.a. capture) is the shipped portion of an order that
 * Billie factors and pays out to the merchant. It maps onto the canonical
 * Invoice. Money is `TaxedMoney` decimals in euros.
 *
 * Docs: https://docs.billie.io/reference/get_invoice
 */
export interface RawBillieInvoice {
  uuid?: string
  invoice_number?: string | null
  state?: string | null
  amount?: TaxedMoney | null
  outstanding_amount?: TaxedMoney | null
  payout_amount?: TaxedMoney | null
  fee_amount?: TaxedMoney | null
  fee_rate?: number | null
  duration?: number | null
  due_date?: string | null
  created_at?: string | null
  selected_payment_method?: string | null
  [k: string]: unknown
}

function mapStatus(state: string | null | undefined): InvoiceStatus {
  switch (String(state ?? '').toLowerCase()) {
    case 'paid_out':
    case 'complete':
      return 'paid'
    case 'cancelled':
    case 'canceled':
      return 'void'
    case 'late':
    case 'new':
    case 'created':
      return 'open'
    default:
      return 'open'
  }
}

export function transformInvoice(raw: RawBillieInvoice): Invoice {
  const total = grossMinor(raw.amount)
  const outstanding = raw.outstanding_amount ? grossMinor(raw.outstanding_amount) : undefined
  return {
    id: String(raw.uuid ?? ''),
    externalId: String(raw.uuid ?? ''),
    number: raw.invoice_number ?? undefined,
    status: mapStatus(raw.state),
    currency: pickCurrency(null),
    subtotal: toMinorUnits(raw.amount?.net),
    tax: raw.amount?.tax != null ? toMinorUnits(raw.amount.tax) : undefined,
    total,
    amountDue: outstanding,
    amountRemaining: outstanding,
    amountPaid: outstanding != null ? total - outstanding : undefined,
    dueDate: toIsoDatetime(raw.due_date),
    gateway: 'billie',
    metadata: strMap({
      state: raw.state,
      payout_gross: raw.payout_amount?.gross,
      fee_gross: raw.fee_amount?.gross,
      fee_rate: raw.fee_rate,
      duration: raw.duration,
      selected_payment_method: raw.selected_payment_method,
    }),
    createdAt: toIsoDatetime(raw.created_at),
    raw,
  }
}
