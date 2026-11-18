/**
 * Dodo Payments customer payment method → canonical `PaymentMethod`.
 *
 * Endpoint: GET /customers/{customer_id}/payment-methods
 * Returns `{ items: [...] }`. Requires a `customer_id` path parameter; there
 * is no cross-customer payment-method listing endpoint on Dodo.
 *
 * `payment_method` is the broad type (card, wallet, bank_transfer, crypto);
 * `payment_method_type` is the specific sub-type (ach, klarna, paypal …).
 *
 * Docs: https://docs.dodopayments.com/api-reference/customers/get-customer-payment-methods
 */
import type { PaymentMethod, PaymentMethodType } from '../../../schema/payment-method'
import { toIsoDatetime } from '@opensteward/shared'
import { strMap } from './shared'

export interface RawDodoPaymentMethodCard {
  card_holder_name?: string | null
  card_network?: string | null
  card_type?: string | null
  last4_digits?: string | null
  expiry_month?: string | null
  expiry_year?: string | null
  card_issuing_country?: string | null
}

export interface RawDodoPaymentMethod {
  payment_method_id?: string
  payment_method?: string | null
  payment_method_type?: string | null
  card?: RawDodoPaymentMethodCard | null
  last_used_at?: string | null
  recurring_enabled?: boolean | null
  /** Injected by the adapter so transforms can link PMs back to customers. */
  customer_id?: string
  [k: string]: unknown
}

function mapType(pm: string | null | undefined): PaymentMethodType {
  switch ((pm ?? '').toLowerCase()) {
    case 'card':
      return 'card'
    case 'wallet':
      return 'wallet'
    case 'bank_transfer':
      return 'bank_account'
    case 'crypto':
      return 'other'
    default:
      return 'other'
  }
}

export function transformPaymentMethod(
  raw: RawDodoPaymentMethod,
  customerId?: string,
): PaymentMethod {
  const card = raw.card
  const expMonth = card?.expiry_month ? parseInt(card.expiry_month, 10) : undefined
  const expYear = card?.expiry_year ? parseInt(card.expiry_year, 10) : undefined
  return {
    id: String(raw.payment_method_id ?? ''),
    externalId: String(raw.payment_method_id ?? ''),
    customerId: customerId ?? raw.customer_id ?? undefined,
    type: mapType(raw.payment_method),
    brand: card?.card_network ?? undefined,
    last4: card?.last4_digits ?? undefined,
    expMonth: Number.isFinite(expMonth) ? expMonth : undefined,
    expYear: Number.isFinite(expYear) ? expYear : undefined,
    holderName: card?.card_holder_name ?? undefined,
    bankName: undefined,
    isDefault: undefined,
    fingerprint: undefined,
    gateway: 'dodo-payments',
    metadata: strMap({
      payment_method_type: raw.payment_method_type,
      card_type: card?.card_type,
      card_issuing_country: card?.card_issuing_country,
      recurring_enabled: raw.recurring_enabled,
    }),
    createdAt: toIsoDatetime(raw.last_used_at),
    updatedAt: toIsoDatetime(raw.last_used_at),
    raw,
  }
}
