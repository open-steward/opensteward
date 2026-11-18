import type { PaymentMethod, PaymentMethodType } from '../../../schema/payment-method'
import { strMap } from './shared'

export interface RawStaxPaymentMethod {
  [k: string]: unknown
}

function mapType(method: string | undefined | null): PaymentMethodType {
  const v = typeof method === 'string' ? method.toLowerCase() : ''
  if (v.includes('card') || v === 'credit' || v === 'debit') return 'card'
  if (v.includes('bank') || v === 'ach' || v === 'check') return 'bank_account'
  return 'other'
}

export function transformPaymentMethod(raw: RawStaxPaymentMethod): PaymentMethod {
  return {
    id: String(raw['id'] ?? ''),
    externalId: String(raw['id'] ?? ''),
    customerId: raw['customer_id'] != null ? String(raw['customer_id']) : undefined,
    type: mapType(raw['method'] as string | undefined ?? raw['card_type'] as string | undefined),
    brand: raw['card_type'] != null ? String(raw['card_type']) : undefined,
    last4: raw['card_last_four'] != null ? String(raw['card_last_four']) : undefined,
    expMonth: raw['card_exp'] != null
      ? parseInt(String(raw['card_exp']).slice(0, 2), 10) || undefined
      : undefined,
    expYear: raw['card_exp'] != null
      ? parseInt(String(raw['card_exp']).slice(2, 4), 10) + 2000 || undefined
      : undefined,
    holderName: raw['person_name'] != null ? String(raw['person_name']) : undefined,
    bankName: raw['bank_name'] != null ? String(raw['bank_name']) : undefined,
    isDefault: raw['default'] === true || raw['default'] === 1,
    gateway: 'stax-payments',
    metadata: strMap(raw['meta'] ?? {}),
    createdAt: raw['created_at'] != null ? String(raw['created_at']) : undefined,
    updatedAt: raw['updated_at'] != null ? String(raw['updated_at']) : undefined,
    raw,
  }
}
