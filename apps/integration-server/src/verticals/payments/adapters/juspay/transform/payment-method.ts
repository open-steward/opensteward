import { toIsoDatetime } from '@opensteward/shared'
import type { PaymentMethod, PaymentMethodType } from '../../../schema/payment-method'
import { strMap } from './shared'

/**
 * Juspay saved payment method.
 *
 * Returned inside `saved_payment_methods.payment_method_details[].list[]` by
 * `POST /customers/{customer_id}/payment_methods` (fetch saved payment methods).
 *
 * Each entry has a payment_method_type (CARD / WALLET / UPI_COLLECT / NB)
 * plus type-specific details.
 *
 * Docs: https://juspay.io/sea/docs/api-reference/docs/express-checkout/fetch-saved-payment-methods
 */
export interface RawJuspayCard {
  card_brand?: string | null
  card_isin?: string | null
  card_type?: string | null
  card_issuer?: string | null
  name_on_card?: string | null
  expiry_month?: string | null
  expiry_year?: string | null
  last_four_digits?: string | null
  using_saved_card?: boolean
  saved_to_locker?: boolean
  [k: string]: unknown
}

export interface RawJuspayWallet {
  wallet?: string | null
  linked?: boolean
  current_balance?: number | null
  gateway_reference_id?: string | null
  [k: string]: unknown
}

export interface RawJuspayUpi {
  vpa?: string | null
  [k: string]: unknown
}

export interface RawJuspayPaymentMethod {
  payment_method_type?: string | null
  payment_method?: string | null
  card?: RawJuspayCard | null
  wallet?: RawJuspayWallet | null
  upi?: RawJuspayUpi | null
  /** caller threads in the customer id */
  customer_id?: string | null
  last_used?: string | null
  [k: string]: unknown
}

function mapType(rawType: string | null | undefined): PaymentMethodType {
  switch ((rawType ?? '').toUpperCase()) {
    case 'CARD':
      return 'card'
    case 'WALLET':
      return 'wallet'
    case 'UPI_COLLECT':
    case 'UPI':
      return 'a2a'
    case 'NB':
    case 'NETBANKING':
      return 'bank_account'
    default:
      return 'other'
  }
}

export function transformPaymentMethod(raw: RawJuspayPaymentMethod): PaymentMethod {
  const type = mapType(raw.payment_method_type)
  const card = raw.card ?? {}
  const wallet = raw.wallet ?? {}
  const upi = raw.upi ?? {}

  // Build a stable synthetic id from the fingerprint-like fields available.
  const idParts = [
    raw.payment_method_type,
    card.card_isin ?? wallet.wallet ?? upi.vpa ?? raw.payment_method,
    card.last_four_digits ?? card.expiry_year,
  ].filter(Boolean)
  const id = idParts.join('_') || 'pm_unknown'

  return {
    id,
    externalId: id,
    customerId: raw.customer_id ?? undefined,
    type,
    brand:
      (card.card_brand ?? wallet.wallet ?? raw.payment_method ?? undefined)?.toLowerCase() ??
      undefined,
    last4: card.last_four_digits ?? undefined,
    expMonth: card.expiry_month ? parseInt(card.expiry_month, 10) : undefined,
    expYear: card.expiry_year ? parseInt(card.expiry_year, 10) : undefined,
    holderName: card.name_on_card ?? undefined,
    bankName: card.card_issuer ?? undefined,
    isDefault: undefined,
    fingerprint: card.card_isin ?? undefined,
    gateway: 'juspay',
    metadata: strMap({
      payment_method_type: raw.payment_method_type,
      card_type: card.card_type,
      using_saved_card: card.using_saved_card != null ? String(card.using_saved_card) : undefined,
      vpa: upi.vpa,
      wallet_linked: wallet.linked != null ? String(wallet.linked) : undefined,
    }),
    createdAt: toIsoDatetime(raw.last_used),
    updatedAt: toIsoDatetime(raw.last_used),
    raw,
  }
}
