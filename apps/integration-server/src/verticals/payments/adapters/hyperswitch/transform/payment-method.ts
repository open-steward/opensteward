/**
 * Hyperswitch CustomerPaymentMethod → canonical PaymentMethod.
 *
 * Saved payment methods are fetched from GET /customers/{customer_id}/payment_methods.
 * The response envelope is `CustomerPaymentMethodsListResponse` with a
 * `customer_payment_methods` array. Each element carries `payment_token` as the
 * public identifier, `payment_method_id` as the locker identifier, card details
 * in the nested `card` object, and `default_payment_method_set` for the default flag.
 *
 * Docs: https://api-reference.hyperswitch.io/v1/payment-methods/list-payment-methods-for-a-customer
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { PaymentMethod, PaymentMethodType } from '../../../schema/payment-method'
import { strMap } from './shared'

export interface RawHyperswitchCardDetails {
  scheme?: string | null
  last4_digits?: string | null
  expiry_month?: string | null
  expiry_year?: string | null
  card_holder_name?: string | null
  nick_name?: string | null
  [k: string]: unknown
}

export interface RawHyperswitchSavedPaymentMethod {
  payment_token?: string
  payment_method_id?: string
  customer_id?: string
  payment_method?: string | null
  payment_method_type?: string | null
  payment_method_issuer?: string | null
  payment_method_issuer_code?: string | null
  recurring_enabled?: boolean
  card?: RawHyperswitchCardDetails | null
  created?: string | null
  last_used_at?: string | null
  default_payment_method_set?: boolean
  requires_cvv?: boolean
  [k: string]: unknown
}

/** Map Hyperswitch payment_method string to canonical PaymentMethodType. */
function mapType(raw: RawHyperswitchSavedPaymentMethod): PaymentMethodType {
  switch ((raw.payment_method ?? '').toLowerCase()) {
    case 'card':
      return 'card'
    case 'bank_transfer':
    case 'bank_debit':
    case 'bank_redirect':
      return 'bank_account'
    case 'wallet':
      return 'wallet'
    case 'pay_later':
    case 'bnpl':
      return 'bnpl'
    default:
      return 'other'
  }
}

export function transformPaymentMethod(raw: RawHyperswitchSavedPaymentMethod): PaymentMethod {
  // payment_token is the public-facing token; payment_method_id is the locker id.
  // We use payment_method_id as canonical `id` when available, falling back to token.
  const id = String(raw.payment_method_id ?? raw.payment_token ?? '')
  const card = raw.card
  return {
    id,
    externalId: id,
    customerId: raw.customer_id ?? undefined,
    type: mapType(raw),
    brand: card?.scheme ?? undefined,
    last4: card?.last4_digits ?? undefined,
    expMonth: card?.expiry_month ? parseInt(card.expiry_month, 10) : undefined,
    expYear: card?.expiry_year ? parseInt(card.expiry_year, 10) : undefined,
    holderName: card?.card_holder_name ?? undefined,
    bankName: raw.payment_method_issuer ?? undefined,
    isDefault: raw.default_payment_method_set ?? undefined,
    gateway: 'hyperswitch',
    metadata: strMap({
      payment_token: raw.payment_token,
      payment_method_type: raw.payment_method_type,
      payment_method_issuer_code: raw.payment_method_issuer_code,
      recurring_enabled: raw.recurring_enabled,
      requires_cvv: raw.requires_cvv,
    }),
    createdAt: toIsoDatetime(raw.created) ?? undefined,
    updatedAt: toIsoDatetime(raw.last_used_at) ?? undefined,
    raw,
  }
}
