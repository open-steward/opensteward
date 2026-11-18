/**
 * Paydock customer payment source → canonical PaymentMethod.
 *
 * Paydock nests payment sources in the customer resource
 * (https://documenter.getpostman.com/view/6912944/Uyr5my5q, folder
 * "customers"): `payment_sources[].type` ("card for payment sources created
 * with credit card, bank_account for payment sources created with direct
 * debit, checkout for payment sources created with checkout agreement"),
 * `card_name`, `card_number_last4`, `card_scheme`, `expire_month`,
 * `expire_year`, `account_name`, `account_bank_name`, `created_at`,
 * `updated_at`. The owning customer is the parent row; `default_source` on it
 * names the default payment source.
 */
import type { PaymentMethod, PaymentMethodType } from '../../../schema/payment-method'
import { optStr, requireId } from './shared'

export interface RawPaydockPaymentSource {
  [k: string]: unknown
}

const TYPE: Record<string, PaymentMethodType> = {
  card: 'card',
  bank_account: 'bank_account',
  checkout: 'other',
}

function month(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : optStr(v) !== undefined ? Number(v) : NaN
  return Number.isInteger(n) && n >= 1 && n <= 12 ? n : undefined
}

function year(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : optStr(v) !== undefined ? Number(v) : NaN
  return Number.isInteger(n) ? n : undefined
}

export function transformPaymentMethod(
  raw: RawPaydockPaymentSource,
  customer: { customerId: string; defaultSourceId?: string },
): PaymentMethod {
  const id = requireId(raw['_id'], 'payment source')
  const type = (typeof raw['type'] === 'string' && TYPE[raw['type']]) || 'unknown'
  return {
    id,
    externalId: id,
    customerId: customer.customerId,
    type,
    brand: optStr(raw['card_scheme']),
    last4: optStr(raw['card_number_last4']),
    expMonth: month(raw['expire_month']),
    expYear: year(raw['expire_year']),
    holderName: type === 'bank_account' ? optStr(raw['account_name']) : optStr(raw['card_name']),
    bankName: optStr(raw['account_bank_name']),
    isDefault: customer.defaultSourceId !== undefined ? customer.defaultSourceId === id : undefined,
    gateway: 'paydock',
    metadata: {},
    createdAt: optStr(raw['created_at']),
    updatedAt: optStr(raw['updated_at']),
    raw,
  }
}
