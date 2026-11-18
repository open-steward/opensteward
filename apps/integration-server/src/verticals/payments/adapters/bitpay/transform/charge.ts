import { toIsoDatetime } from '@opensteward/shared'
import type { Charge, ChargeStatus } from '../../../schema/charge'
import { pickCurrency, strMap, toMinorUnits } from './shared'

/**
 * BitPay invoice → canonical Charge.
 *
 * An invoice is BitPay's amount-bearing object: it carries the requested
 * `price` (fiat major units), the settlement `currency`, the lifecycle
 * `status` (new → paid → confirmed → complete, plus expired / invalid), and an
 * `exceptionStatus` flag that distinguishes the partial/over-payment auto-
 * refund cases. There is no separate authorise/capture step, so captured
 * charges are simply those that reached a settled state.
 *
 * Docs: https://developer.bitpay.com/reference/create-an-invoice
 *       https://developer.bitpay.com/docs/invoice-states
 */
export interface RawBitpayInvoice {
  id?: string
  guid?: string
  orderId?: string
  status?: string
  exceptionStatus?: boolean | string
  price?: number
  currency?: string
  amountPaid?: number
  displayAmountPaid?: string
  url?: string
  itemDesc?: string
  posData?: string
  transactionCurrency?: string
  invoiceTime?: number
  expirationTime?: number
  currentTime?: number
  buyer?: { email?: string; name?: string }
  buyerProvidedInfo?: { emailAddress?: string; name?: string }
  buyerProvidedEmail?: string
  refundAddresses?: unknown
  transactions?: unknown
  [k: string]: unknown
}

function mapStatus(raw: RawBitpayInvoice): ChargeStatus {
  // paidPartial / paidOver are auto-refunded by BitPay back to the buyer.
  const exception = raw.exceptionStatus
  if (exception === 'paidPartial' || exception === 'paidOver') return 'refunded'

  switch ((raw.status ?? '').toLowerCase()) {
    case 'complete':
    case 'confirmed':
      return 'succeeded'
    case 'paid':
    case 'new':
      return 'pending'
    case 'expired':
      return 'cancelled'
    case 'invalid':
      return 'failed'
    default:
      return 'pending'
  }
}

export function transformCharge(raw: RawBitpayInvoice): Charge {
  const currency = pickCurrency(raw.currency)
  const status = mapStatus(raw)
  const email =
    raw.buyerProvidedInfo?.emailAddress ?? raw.buyer?.email ?? raw.buyerProvidedEmail
  return {
    id: String(raw.id ?? raw.guid ?? ''),
    externalId: String(raw.id ?? raw.guid ?? ''),
    amount: toMinorUnits(raw.price, currency),
    currency,
    status,
    captured: status === 'succeeded',
    description: raw.itemDesc ?? undefined,
    receiptUrl: raw.url ?? undefined,
    receiptEmail: email ?? undefined,
    gateway: 'bitpay',
    metadata: strMap({
      orderId: raw.orderId,
      status: raw.status,
      exceptionStatus: raw.exceptionStatus,
      transactionCurrency: raw.transactionCurrency,
      amountPaid: raw.amountPaid,
      displayAmountPaid: raw.displayAmountPaid,
      posData: raw.posData,
    }),
    createdAt: toIsoDatetime(raw.invoiceTime),
    updatedAt: toIsoDatetime(raw.currentTime),
    raw,
  }
}
