import { toIsoDatetime } from '@opensteward/shared'
import type { Charge, ChargeStatus } from '../../../schema/charge'
import { pickCurrency, strMap, toMinorUnits } from './shared'

/**
 * A single basket-item breakdown of a payment. iyzico settles each item
 * separately, so the refund unit (`paymentTransactionId`) lives here, not on
 * the payment root.
 */
export interface RawIyzicoItemTransaction {
  itemId?: string
  paymentTransactionId?: string | number
  transactionStatus?: number
  price?: number | string
  paidPrice?: number | string
  merchantCommissionRate?: number
  iyziCommissionFee?: number | string
  [k: string]: unknown
}

/** Shape of the `POST /payment/detail` response (a.k.a. retrieve payment). */
export interface RawIyzicoPayment {
  status?: string
  paymentId?: string | number
  conversationId?: string
  paymentConversationId?: string
  basketId?: string
  /** Total transaction amount before installment commission. */
  price?: number | string
  /** Amount actually charged to the card (incl. installment commission). */
  paidPrice?: number | string
  currency?: string
  installment?: number
  /** SUCCESS, FAILURE, INIT_THREEDS, CALLBACK_THREEDS, PENDING_CREDIT, … */
  paymentStatus?: string
  /** 1 = OK, 0 = restricted, -1 = waiting. */
  fraudStatus?: number
  cardType?: string
  cardAssociation?: string
  cardFamily?: string
  binNumber?: string
  lastFourDigits?: string
  phase?: string
  authCode?: string
  hostReference?: string
  errorCode?: string
  errorMessage?: string
  systemTime?: number
  createdDate?: string
  itemTransactions?: RawIyzicoItemTransaction[]
  [k: string]: unknown
}

/**
 * Map iyzico's split status fields to a canonical ChargeStatus.
 *
 * iyzico does not carry a "refunded" status on the payment root — refunds are
 * tracked per basket item and surfaced via the refund object — so this maps
 * only the authorise/capture/decline lifecycle.
 */
function mapStatus(raw: RawIyzicoPayment): ChargeStatus {
  // Top-level `status` is request-level (success = the API call succeeded);
  // `paymentStatus` carries the financial outcome of the payment itself.
  if ((raw.status ?? '').toLowerCase() === 'failure') return 'failed'
  switch ((raw.paymentStatus ?? '').toUpperCase()) {
    case 'SUCCESS':
      return 'succeeded'
    case 'FAILURE':
    case 'BANK_FRAUD':
      return 'failed'
    case 'INIT_THREEDS':
    case 'CALLBACK_THREEDS':
    case 'PENDING_CREDIT':
      return 'pending'
    default:
      // A `success` request status with no explicit paymentStatus means the
      // payment cleared (the detail endpoint only returns settled payments).
      return (raw.status ?? '').toLowerCase() === 'success' ? 'succeeded' : 'pending'
  }
}

export function transformCharge(raw: RawIyzicoPayment): Charge {
  const id = String(raw.paymentId ?? raw.paymentConversationId ?? raw.conversationId ?? '')
  const status = mapStatus(raw)
  // `paidPrice` is what hit the card; fall back to `price` when absent.
  const amount = toMinorUnits(raw.paidPrice) ?? toMinorUnits(raw.price) ?? 0
  const refundIds = (raw.itemTransactions ?? [])
    .map((t) => (t.paymentTransactionId == null ? '' : String(t.paymentTransactionId)))
    .filter((v) => v.length > 0)

  return {
    id,
    externalId: id,
    amount,
    currency: pickCurrency(raw.currency),
    status,
    captured: status === 'succeeded',
    failureMessage: raw.errorMessage,
    failureCode: raw.errorCode,
    refundIds: refundIds.length > 0 ? refundIds : undefined,
    gateway: 'iyzico',
    metadata: strMap({
      conversationId: raw.conversationId,
      basketId: raw.basketId,
      installment: raw.installment,
      fraudStatus: raw.fraudStatus,
      cardType: raw.cardType,
      cardAssociation: raw.cardAssociation,
      cardFamily: raw.cardFamily,
      binNumber: raw.binNumber,
      lastFourDigits: raw.lastFourDigits,
      authCode: raw.authCode,
      hostReference: raw.hostReference,
      phase: raw.phase,
    }),
    createdAt: toIsoDatetime(raw.createdDate ?? raw.systemTime),
    raw,
  }
}
