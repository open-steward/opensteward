import { toIsoDatetime } from '@opensteward/shared'
import type { PaymentMethod, PaymentMethodType } from '../../../schema/payment-method'
import { strMap } from './shared'

/**
 * A vaulted Spreedly payment method. Spreedly is a card vault first, so this
 * is the adapter's richest resource: it tokenises cards / bank accounts /
 * wallets and exposes them under a stable `token`.
 *
 * Docs: https://docs.spreedly.com/reference/api/v1/payment_methods/
 */
export interface RawSpreedlyPaymentMethod {
  token?: string
  payment_method_type?: string
  storage_state?: string
  test?: boolean
  card_type?: string
  last_four_digits?: string
  first_six_digits?: string
  month?: number
  year?: number
  first_name?: string
  last_name?: string
  full_name?: string
  email?: string
  phone_number?: string
  company?: string
  fingerprint?: string
  bank_name?: string
  metadata?: Record<string, unknown> | null
  created_at?: string
  updated_at?: string
  [k: string]: unknown
}

function mapType(spreedlyType: string | undefined): PaymentMethodType {
  switch ((spreedlyType ?? '').toLowerCase()) {
    case 'credit_card':
      return 'card'
    case 'bank_account':
      return 'bank_account'
    case 'apple_pay':
    case 'google_pay':
      return 'wallet'
    default:
      return 'other'
  }
}

export function transformPaymentMethod(raw: RawSpreedlyPaymentMethod): PaymentMethod {
  const token = raw.token ?? ''
  const composedName = [raw.first_name, raw.last_name].filter(Boolean).join(' ').trim()
  const holderName = raw.full_name ?? (composedName || undefined)
  return {
    id: token,
    externalId: token,
    type: mapType(raw.payment_method_type),
    brand: raw.card_type ?? raw.payment_method_type ?? undefined,
    last4: raw.last_four_digits ?? undefined,
    expMonth: typeof raw.month === 'number' ? raw.month : undefined,
    expYear: typeof raw.year === 'number' ? raw.year : undefined,
    holderName,
    bankName: raw.bank_name ?? undefined,
    fingerprint: raw.fingerprint ?? undefined,
    gateway: 'spreedly',
    metadata: strMap({
      ...(raw.metadata ?? {}),
      storage_state: raw.storage_state,
      first_six_digits: raw.first_six_digits,
      email: raw.email,
      company: raw.company,
      test: raw.test,
    }),
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.updated_at),
    raw,
  }
}
