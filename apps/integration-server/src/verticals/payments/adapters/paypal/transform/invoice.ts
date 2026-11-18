import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import { decimalToMinor, pickCurrency, strMap } from './shared'

export interface RawPayPalInvoice {
  id?: string
  status?: string
  detail?: { invoice_number?: string; currency_code?: string }
  amount?: { value?: string; currency_code?: string }
  due_amount?: { value?: string }
  gross_amount?: { value?: string }
  invoicer?: { email_address?: string }
  primary_recipients?: Array<{ billing_info?: { email_address?: string } }>
  payments?: { paid_amount?: { value?: string } }
  refunds?: { refund_amount?: { value?: string } }
  metadata?: Record<string, unknown>
  [k: string]: unknown
}

function mapStatus(raw: RawPayPalInvoice): InvoiceStatus {
  switch (raw.status) {
    case 'DRAFT':
      return 'draft'
    case 'PAID':
      return 'paid'
    case 'CANCELLED':
      return 'void'
    case 'MARKED_AS_PAID':
      return 'paid'
    case 'PARTIALLY_PAID':
    case 'SENT':
    case 'PAYMENT_PENDING':
      return 'open'
    default:
      return 'open'
  }
}

export function transformInvoice(raw: RawPayPalInvoice): Invoice {
  const currency = pickCurrency(raw.detail?.currency_code ?? raw.amount?.currency_code)
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    number: raw.detail?.invoice_number,
    status: mapStatus(raw),
    currency,
    total: decimalToMinor(raw.amount?.value),
    amountDue: decimalToMinor(raw.due_amount?.value),
    amountPaid: decimalToMinor(raw.payments?.paid_amount?.value),
    gateway: 'paypal',
    metadata: strMap(raw.metadata),
    raw,
  }
}
