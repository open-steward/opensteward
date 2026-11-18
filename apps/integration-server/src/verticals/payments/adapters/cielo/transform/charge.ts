import type { Charge, ChargeStatus } from '../../../schema/charge'
import { isoOrUndefined, pickCurrency, strMap } from './shared'

/**
 * Cielo Sale response (POST / GET `/1/sales`). The transactable lives under
 * `Payment`; the buyer (if supplied) under `Customer`. Cielo has no standalone
 * customer object — the buyer is embedded in each sale — so we surface the
 * buyer email on the charge rather than a `customerId`.
 */
export interface RawCieloCustomer {
  Name?: string
  Email?: string
  Identity?: string
  IdentityType?: string
  [k: string]: unknown
}

export interface RawCieloCreditCard {
  CardNumber?: string
  Holder?: string
  ExpirationDate?: string
  Brand?: string
  CardToken?: string
  [k: string]: unknown
}

export interface RawCieloPayment {
  PaymentId?: string
  Type?: string
  Amount?: number
  CapturedAmount?: number
  ServiceTaxAmount?: number
  Installments?: number
  Currency?: string
  Country?: string
  Provider?: string
  Capture?: boolean
  ReceivedDate?: string
  CapturedDate?: string
  Tid?: string
  ProofOfSale?: string
  AuthorizationCode?: string
  CreditCard?: RawCieloCreditCard
  Status?: number
  ReturnCode?: string
  ReturnMessage?: string
  ReasonCode?: number
  ReasonMessage?: string
  [k: string]: unknown
}

export interface RawCieloSale {
  MerchantOrderId?: string
  Customer?: RawCieloCustomer
  Payment?: RawCieloPayment
  [k: string]: unknown
}

/**
 * Cielo transaction status codes.
 *   0  NotFinished        1  Authorized          2  PaymentConfirmed (captured)
 *   3  Denied             10 Voided              11 Refunded
 *   12 Pending            13 Aborted             20 Scheduled
 * Authorized-but-not-captured is treated as `pending` (canonical has no
 * dedicated authorized/uncaptured state).
 */
function mapStatus(status: number | undefined): ChargeStatus {
  switch (status) {
    case 2:
      return 'succeeded'
    case 3:
    case 13:
      return 'failed'
    case 10:
      return 'cancelled'
    case 11:
      return 'refunded'
    case 0:
    case 1:
    case 12:
    case 20:
      return 'pending'
    default:
      return 'pending'
  }
}

export function transformCharge(raw: RawCieloSale): Charge {
  const payment = raw.Payment ?? {}
  const status = mapStatus(payment.Status)
  const captured = payment.Status === 2 || (payment.CapturedAmount ?? 0) > 0
  return {
    id: String(payment.PaymentId ?? ''),
    externalId: String(payment.PaymentId ?? ''),
    amount: payment.Amount ?? 0,
    currency: pickCurrency(payment.Currency),
    amountCaptured: payment.CapturedAmount,
    status,
    captured,
    capturedAt: isoOrUndefined(payment.CapturedDate),
    receiptEmail: raw.Customer?.Email,
    failureCode: payment.ReturnCode,
    failureMessage: status === 'failed' ? payment.ReturnMessage : undefined,
    gateway: 'cielo',
    metadata: strMap({
      MerchantOrderId: raw.MerchantOrderId,
      Tid: payment.Tid,
      ProofOfSale: payment.ProofOfSale,
      AuthorizationCode: payment.AuthorizationCode,
      Provider: payment.Provider,
      PaymentType: payment.Type,
      Installments: payment.Installments,
      Brand: payment.CreditCard?.Brand,
      Holder: payment.CreditCard?.Holder,
      ReturnCode: payment.ReturnCode,
      ReturnMessage: payment.ReturnMessage,
    }),
    createdAt: isoOrUndefined(payment.ReceivedDate),
    updatedAt: isoOrUndefined(payment.CapturedDate) ?? isoOrUndefined(payment.ReceivedDate),
    raw,
  }
}
