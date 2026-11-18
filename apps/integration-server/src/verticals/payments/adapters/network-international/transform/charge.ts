/**
 * Network International (N-Genius) order ↔ canonical Charge.
 *
 * N-Genius is order-centric: an `order` carries an `_embedded.payment[]`
 * array, and the first payment holds the real money state. The canonical
 * `Charge.id` is the order reference (stable, what every other path is keyed
 * by); amount/currency/status come from the embedded payment when present and
 * fall back to the order envelope otherwise.
 *
 * Order/payment `state` values seen on the wire: STARTED, AWAIT_3DS,
 * AUTHORISED, CAPTURED, PURCHASED, PARTIALLY_REFUNDED, FAILED, DECLINED,
 * REVERSED, EXPIRED.
 *
 * Transforms never throw — missing optionals collapse to `undefined`.
 */
import type { Charge, ChargeStatus } from '../../../schema/charge'
import { pickAmount, pickCurrency, strMap, toIsoDatetime, type NgeniusAmount } from './shared'

export interface RawNgeniusPaymentMethod {
  name?: string
  pan?: string
  cardholderName?: string
  expiry?: string
  cvv?: string
  [k: string]: unknown
}

export interface RawNgeniusPayment {
  _id?: string
  reference?: string
  orderReference?: string
  state?: string
  amount?: NgeniusAmount
  paymentMethod?: RawNgeniusPaymentMethod
  authResponse?: { success?: boolean; message?: string; resultCode?: string }
  updateDateTime?: string
  createDateTime?: string
  [k: string]: unknown
}

export interface RawNgeniusOrder {
  reference?: string
  action?: string
  state?: string
  amount?: NgeniusAmount
  emailAddress?: string
  language?: string
  createDateTime?: string
  updateDateTime?: string
  merchantAttributes?: Record<string, unknown>
  _embedded?: { payment?: RawNgeniusPayment[] }
  [k: string]: unknown
}

/** First embedded payment, if any — where the money state lives. */
function firstPayment(raw: RawNgeniusOrder): RawNgeniusPayment | undefined {
  return raw._embedded?.payment?.[0]
}

function mapStatus(state: string | undefined): ChargeStatus {
  switch ((state ?? '').toUpperCase()) {
    case 'CAPTURED':
    case 'PURCHASED':
      return 'succeeded'
    case 'PARTIALLY_REFUNDED':
      return 'partially_refunded'
    case 'REVERSED':
      return 'refunded'
    case 'FAILED':
    case 'DECLINED':
    case 'EXPIRED':
      return 'failed'
    case 'AUTHORISED':
    case 'STARTED':
    case 'AWAIT_3DS':
      return 'pending'
    default:
      return 'pending'
  }
}

export function transformCharge(raw: RawNgeniusOrder): Charge {
  const payment = firstPayment(raw)
  const orderRef = String(raw.reference ?? payment?.orderReference ?? '')
  const amountObj = payment?.amount ?? raw.amount
  const state = payment?.state ?? raw.state
  const captured = (state ?? '').toUpperCase() === 'CAPTURED' || (state ?? '').toUpperCase() === 'PURCHASED'

  return {
    id: orderRef,
    externalId: orderRef,
    amount: pickAmount(amountObj),
    currency: pickCurrency(amountObj),
    status: mapStatus(state),
    captured,
    receiptEmail: raw.emailAddress ?? undefined,
    paymentMethodId: payment?.reference ?? undefined,
    failureMessage: payment?.authResponse?.success === false ? payment.authResponse.message : undefined,
    failureCode: payment?.authResponse?.success === false ? payment.authResponse.resultCode : undefined,
    gateway: 'network-international',
    metadata: strMap({
      action: raw.action,
      orderState: raw.state,
      paymentState: payment?.state,
      paymentMethod: payment?.paymentMethod?.name,
      cardholderName: payment?.paymentMethod?.cardholderName,
      language: raw.language,
      ...raw.merchantAttributes,
    }),
    createdAt: toIsoDatetime(raw.createDateTime ?? payment?.createDateTime),
    updatedAt: toIsoDatetime(payment?.updateDateTime ?? raw.updateDateTime),
    raw,
  }
}
