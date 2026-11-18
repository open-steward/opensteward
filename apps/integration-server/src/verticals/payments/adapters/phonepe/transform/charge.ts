import { toIsoDatetime } from '@opensteward/shared'
import type { Charge, ChargeStatus } from '../../../schema/charge'
import { pickCurrency, strMap, toMinorUnits } from './shared'

/** One attempt inside the order-status `paymentDetails` array. */
export interface RawPhonepePaymentDetail {
  transactionId?: string
  paymentMode?: string
  timestamp?: number
  amount?: number
  state?: string
  errorCode?: string | null
  detailedErrorCode?: string | null
  rail?: { type?: string; utr?: string; upiTransactionId?: string; vpa?: string } | null
  instrument?: {
    type?: string
    maskedAccountNumber?: string
    accountType?: string
    accountHolderName?: string
  } | null
  [k: string]: unknown
}

/**
 * Shape returned by both the Create-Payment response (sparse — just
 * `orderId` / `state` / `expireAt` / `redirectUrl`) and the richer
 * Order-Status response (adds `amount` + `paymentDetails`).
 */
export interface RawPhonepeOrder {
  orderId?: string
  merchantOrderId?: string
  state?: string
  amount?: number
  expireAt?: number
  redirectUrl?: string
  paymentDetails?: RawPhonepePaymentDetail[]
  [k: string]: unknown
}

function mapStatus(state: string | undefined): ChargeStatus {
  switch ((state ?? '').toUpperCase()) {
    case 'COMPLETED':
      return 'succeeded'
    case 'FAILED':
      return 'failed'
    case 'PENDING':
      return 'pending'
    default:
      return 'pending'
  }
}

export function transformCharge(raw: RawPhonepeOrder): Charge {
  // The latest attempt carries the authoritative transaction id + timestamp.
  const details = Array.isArray(raw.paymentDetails) ? raw.paymentDetails : []
  const last = details.length > 0 ? details[details.length - 1] : undefined

  return {
    id: String(raw.merchantOrderId ?? raw.orderId ?? ''),
    externalId: String(raw.orderId ?? raw.merchantOrderId ?? ''),
    amount: toMinorUnits(raw.amount ?? last?.amount),
    currency: pickCurrency(undefined),
    status: mapStatus(raw.state),
    failureCode: last?.errorCode ?? last?.detailedErrorCode ?? undefined,
    gateway: 'phonepe',
    metadata: strMap({
      orderId: raw.orderId,
      merchantOrderId: raw.merchantOrderId,
      transactionId: last?.transactionId,
      paymentMode: last?.paymentMode,
      redirectUrl: raw.redirectUrl,
      utr: last?.rail?.utr,
      upiTransactionId: last?.rail?.upiTransactionId,
      vpa: last?.rail?.vpa,
      instrumentType: last?.instrument?.type,
    }),
    createdAt: toIsoDatetime(last?.timestamp),
    raw,
  }
}
