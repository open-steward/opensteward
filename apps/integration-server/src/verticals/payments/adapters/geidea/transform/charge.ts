/**
 * Geidea is order-centric: an **Order** carries the amount, currency, customer
 * email and payment status, so it maps onto the canonical **Charge**. Geidea
 * exposes both a coarse `status` (Success / Failed / …) and a fine-grained
 * `detailedStatus` (Paid / Authorized / Refunded / PartiallyRefunded / …); we
 * prefer `detailedStatus` and fall back to `status`.
 *
 * Amounts arrive as major-unit decimals (e.g. `10.5`) — converted to canonical
 * integer minor units via `toMinorUnits`.
 */
import type { Charge, ChargeStatus } from '../../../schema/charge'
import { toIsoDatetime } from '@opensteward/shared'
import { pickCurrency, toMinorUnits, strMap, pickStr } from './shared'

export interface RawGeideaPaymentMethod {
  type?: string
  brand?: string
  maskedCardNumber?: string
  cardHolderName?: string
  [k: string]: unknown
}

export interface RawGeideaTransaction {
  transactionId?: string
  type?: string
  status?: string
  amount?: number
  currency?: string
  codeMessage?: string
  responseMessage?: string
  [k: string]: unknown
}

export interface RawGeideaOrder {
  orderId?: string
  merchantReferenceId?: string
  amount?: number
  totalAmount?: number
  settleAmount?: number
  currency?: string
  settleCurrency?: string
  status?: string
  detailedStatus?: string
  responseMessage?: string
  detailedResponseMessage?: string
  responseCode?: string
  detailedResponseCode?: string
  customerEmail?: string
  customerIdentifier?: string
  paymentMethod?: RawGeideaPaymentMethod
  transactions?: RawGeideaTransaction[]
  createdDate?: string
  updatedDate?: string
  metaData?: Record<string, unknown>
  [k: string]: unknown
}

function mapStatus(raw: RawGeideaOrder): ChargeStatus {
  const detailed = (raw.detailedStatus ?? '').toLowerCase()
  switch (detailed) {
    case 'paid':
    case 'captured':
    case 'authorized':
    case 'success':
      return 'succeeded'
    case 'refunded':
      return 'refunded'
    case 'partiallyrefunded':
    case 'partially_refunded':
      return 'partially_refunded'
    case 'chargedback':
    case 'chargeback':
    case 'disputed':
      return 'disputed'
    case 'voided':
    case 'cancelled':
    case 'canceled':
    case 'expired':
      return 'cancelled'
    case 'failed':
    case 'orderfailed':
    case 'declined':
      return 'failed'
    case 'inprogress':
    case 'started':
    case 'pending':
      return 'pending'
    default:
      break
  }
  switch ((raw.status ?? '').toLowerCase()) {
    case 'success':
    case 'paid':
      return 'succeeded'
    case 'failed':
      return 'failed'
    case 'cancelled':
    case 'canceled':
      return 'cancelled'
    default:
      return 'pending'
  }
}

function isCaptured(raw: RawGeideaOrder): boolean {
  const d = (raw.detailedStatus ?? '').toLowerCase()
  return d === 'paid' || d === 'captured' || d === 'refunded' || d === 'partiallyrefunded'
}

export function transformCharge(raw: RawGeideaOrder): Charge {
  const currency = pickCurrency(raw.currency)
  const paymentTx = raw.transactions?.find((t) => (t.type ?? '').toLowerCase() === 'pay')
  const failureMessage =
    mapStatus(raw) === 'failed'
      ? raw.detailedResponseMessage ?? raw.responseMessage ?? paymentTx?.responseMessage
      : undefined
  return {
    id: String(raw.orderId ?? raw.merchantReferenceId ?? ''),
    externalId: String(raw.orderId ?? raw.merchantReferenceId ?? ''),
    amount: toMinorUnits(raw.amount ?? raw.totalAmount, currency) ?? 0,
    currency,
    status: mapStatus(raw),
    captured: isCaptured(raw),
    receiptEmail: pickStr(raw.customerEmail),
    paymentMethodId: pickStr(paymentTx?.transactionId),
    failureCode: mapStatus(raw) === 'failed' ? pickStr(raw.detailedResponseCode) : undefined,
    failureMessage,
    gateway: 'geidea',
    metadata: strMap({
      merchantReferenceId: raw.merchantReferenceId,
      detailedStatus: raw.detailedStatus,
      paymentBrand: raw.paymentMethod?.brand,
      ...raw.metaData,
    }),
    createdAt: toIsoDatetime(raw.createdDate),
    updatedAt: toIsoDatetime(raw.updatedDate),
    raw,
  }
}
