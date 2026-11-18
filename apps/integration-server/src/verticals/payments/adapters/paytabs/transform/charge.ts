import type { Charge, ChargeStatus } from '../../../schema/charge'
import { pickCurrency, strMap, toIsoDatetime, toMinorUnits } from './shared'

/**
 * A PayTabs transaction object, returned by `POST /payment/query` and echoed
 * by `POST /payment/request`. Money is a decimal major-unit string (`cart_amount`)
 * with `cart_currency`; the customer is embedded (`customer_details`) rather
 * than being a first-class resource, so canonical charges carry the email
 * directly instead of a `customerId`.
 *
 * `payment_result.response_status` is a single letter:
 *   A = Authorised (success)  H = Hold (auth on anti-fraud review)
 *   P = Pending (refunds)     V = Voided
 *   D = Declined              E = Error
 *   C = Cancelled
 *
 * Docs: https://docs.paytabs.com/manuals/PT-API-Endpoints/Integration-Types-Manuals/Request-Response-Parameters/
 */
export interface RawPaytabsTransaction {
  tran_ref?: string
  tran_type?: string
  tran_class?: string
  cart_id?: string
  cart_description?: string
  cart_currency?: string
  cart_amount?: string
  customer_details?: {
    name?: string
    email?: string
    phone?: string
    street1?: string
    city?: string
    state?: string
    country?: string
    ip?: string
  }
  payment_result?: {
    response_status?: string
    response_code?: string
    response_message?: string
    transaction_time?: string
  }
  payment_info?: {
    card_type?: string
    card_scheme?: string
    payment_description?: string
    expiryMonth?: number
    expiryYear?: number
  }
  [k: string]: unknown
}

/** Map a PayTabs `response_status` letter onto the canonical {@link ChargeStatus}. */
function mapStatus(raw: RawPaytabsTransaction): ChargeStatus {
  const isCapture = (raw.tran_type ?? '').toLowerCase() === 'capture'
  switch ((raw.payment_result?.response_status ?? '').toUpperCase()) {
    case 'A':
      // Authorised: a captured sale/capture is settled; a bare auth is still pending capture.
      return isCapture || (raw.tran_type ?? '').toLowerCase() === 'sale' ? 'succeeded' : 'pending'
    case 'H':
    case 'P':
      return 'pending'
    case 'V':
    case 'C':
      return 'cancelled'
    case 'D':
    case 'E':
      return 'failed'
    default:
      return 'pending'
  }
}

export function transformCharge(raw: RawPaytabsTransaction): Charge {
  const id = String(raw.tran_ref ?? '')
  const result = raw.payment_result ?? {}
  const status = (result.response_status ?? '').toUpperCase()
  const failed = status === 'D' || status === 'E'
  return {
    id,
    externalId: id,
    amount: toMinorUnits(raw.cart_amount) ?? 0,
    currency: pickCurrency(raw.cart_currency),
    status: mapStatus(raw),
    captured: (raw.tran_type ?? '').toLowerCase() !== 'auth',
    description: raw.cart_description,
    failureCode: failed ? result.response_code : undefined,
    failureMessage: failed ? result.response_message : undefined,
    receiptEmail: raw.customer_details?.email,
    gateway: 'paytabs',
    metadata: strMap({
      tran_type: raw.tran_type,
      tran_class: raw.tran_class,
      cart_id: raw.cart_id,
      response_status: result.response_status,
      response_code: result.response_code,
      response_message: result.response_message,
      card_type: raw.payment_info?.card_type,
      card_scheme: raw.payment_info?.card_scheme,
      customer_name: raw.customer_details?.name,
      customer_phone: raw.customer_details?.phone,
      customer_country: raw.customer_details?.country,
    }),
    createdAt: toIsoDatetime(result.transaction_time),
    updatedAt: toIsoDatetime(result.transaction_time),
    raw,
  }
}
