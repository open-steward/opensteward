import type { PaymentMethod, PaymentMethodType } from '../../../schema/payment-method'
import { toIso, strMap } from './shared'

export interface RawStripePaymentMethod {
  id: string
  object: 'payment_method'
  type: string
  customer?: string | null
  card?: {
    brand?: string
    last4?: string
    exp_month?: number
    exp_year?: number
    fingerprint?: string
  } | null
  us_bank_account?: { bank_name?: string; last4?: string; fingerprint?: string } | null
  sepa_debit?: { last4?: string; fingerprint?: string } | null
  billing_details?: { name?: string | null } | null
  metadata?: Record<string, string> | null
  created?: number
  [key: string]: unknown
}

function mapType(stripeType: string): PaymentMethodType {
  if (stripeType === 'card') return 'card'
  if (stripeType === 'us_bank_account' || stripeType === 'sepa_debit' || stripeType === 'bacs_debit')
    return 'bank_account'
  if (stripeType === 'klarna' || stripeType === 'afterpay_clearpay' || stripeType === 'affirm')
    return 'bnpl'
  if (stripeType === 'apple_pay' || stripeType === 'google_pay' || stripeType === 'wechat_pay')
    return 'wallet'
  return 'other'
}

export function transformPaymentMethod(raw: RawStripePaymentMethod): PaymentMethod {
  const card = raw.card ?? undefined
  const bank = raw.us_bank_account ?? raw.sepa_debit ?? undefined
  return {
    id: raw.id,
    externalId: raw.id,
    customerId: raw.customer ?? undefined,
    type: mapType(raw.type),
    brand: card?.brand ?? raw.type,
    last4: card?.last4 ?? bank?.last4 ?? undefined,
    expMonth: card?.exp_month,
    expYear: card?.exp_year,
    holderName: raw.billing_details?.name ?? undefined,
    bankName: raw.us_bank_account?.bank_name ?? undefined,
    fingerprint: card?.fingerprint ?? bank?.fingerprint ?? undefined,
    gateway: 'stripe',
    metadata: strMap(raw.metadata),
    createdAt: toIso(raw.created),
    raw,
  }
}
