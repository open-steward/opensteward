import { toIsoDatetime } from '@opensteward/shared'
import type { Charge, ChargeStatus } from '../../../schema/charge'
import { pickCurrency, strMap, worldlineDateTime } from './shared'

/**
 * Worldline Direct "Payment" object. Money lives under
 * `paymentOutput.amountOfMoney`; merchant/payment references under
 * `paymentOutput.references`; the lifecycle under `status` / `statusOutput`.
 *
 * Docs: https://docs.direct.worldline-solutions.com/en/api-reference#tag/Payments
 */
export interface RawWorldlineAmountOfMoney {
  amount?: number
  currencyCode?: string
}

export interface RawWorldlinePaymentOutput {
  amountOfMoney?: RawWorldlineAmountOfMoney
  references?: {
    merchantReference?: string
    paymentReference?: string
  }
  paymentMethod?: string
  cardPaymentMethodSpecificOutput?: {
    authorisationCode?: string
    paymentProductId?: number
    card?: { cardNumber?: string }
  }
}

export interface RawWorldlineStatusOutput {
  statusCode?: number
  statusCategory?: string
  isAuthorized?: boolean
  isRefundable?: boolean
  isCancellable?: boolean
  statusCodeChangeDateTime?: string
}

export interface RawWorldlinePayment {
  id?: string
  status?: string
  paymentOutput?: RawWorldlinePaymentOutput
  statusOutput?: RawWorldlineStatusOutput
  [k: string]: unknown
}

/**
 * Map Worldline's `status` enum onto the canonical ChargeStatus. Worldline
 * recommends keying logic off `statusCategory` rather than the precise status,
 * so we fall back to the category for anything we don't recognise.
 */
function mapStatus(raw: RawWorldlinePayment): ChargeStatus {
  switch ((raw.status ?? '').toUpperCase()) {
    case 'CAPTURED':
    case 'COMPLETED':
    case 'PAID':
    case 'CAPTURE_REQUESTED':
    case 'CAPTURE_IN_PROGRESS':
      return 'succeeded'
    case 'REFUNDED':
      return 'refunded'
    case 'CHARGEBACKED':
    case 'CHARGEBACK_NOTIFICATION':
      return 'disputed'
    case 'CANCELLED':
    case 'REVERSED':
      return 'cancelled'
    case 'REJECTED':
    case 'REJECTED_CAPTURE':
      return 'failed'
    case 'CREATED':
    case 'REDIRECTED':
    case 'PENDING_PAYMENT':
    case 'PENDING_FRAUD_APPROVAL':
    case 'PENDING_APPROVAL':
    case 'PENDING_COMPLETION':
    case 'PENDING_CAPTURE':
    case 'AUTHORIZATION_REQUESTED':
    case 'ACCOUNT_VERIFIED':
      return 'pending'
    default:
      switch ((raw.statusOutput?.statusCategory ?? '').toUpperCase()) {
        case 'COMPLETED':
          return 'succeeded'
        case 'REFUNDED':
          return 'refunded'
        case 'REVERSED':
          return 'cancelled'
        case 'UNSUCCESSFUL':
          return 'failed'
        default:
          return 'pending'
      }
  }
}

export function transformCharge(raw: RawWorldlinePayment): Charge {
  const out = raw.paymentOutput ?? {}
  const money = out.amountOfMoney ?? {}
  const refs = out.references ?? {}
  const so = raw.statusOutput ?? {}
  const changedAt = toIsoDatetime(worldlineDateTime(so.statusCodeChangeDateTime))

  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    amount: money.amount ?? 0,
    currency: pickCurrency(money.currencyCode),
    status: mapStatus(raw),
    captured: so.isAuthorized === true && (raw.status ?? '').toUpperCase().includes('CAPTURE'),
    gateway: 'worldline',
    metadata: strMap({
      merchantReference: refs.merchantReference,
      paymentReference: refs.paymentReference,
      paymentMethod: out.paymentMethod,
      authorisationCode: out.cardPaymentMethodSpecificOutput?.authorisationCode,
      statusCode: so.statusCode,
      statusCategory: so.statusCategory,
      worldlineStatus: raw.status,
    }),
    createdAt: changedAt,
    updatedAt: changedAt,
    raw,
  }
}
