import { toIsoDatetime } from '@opensteward/shared'
import type { Customer } from '../../../schema/customer'
import { requireId, str } from './shared'

/**
 * Account resource (https://killbill.github.io/slate/account.html, "Account
 * Resource"): accountId, externalKey, referenceTime ("ISO date and time this
 * account was created"), currency, paymentMethodId, name, email, phone, ...
 */
export interface RawKillbillAccount {
  accountId?: string
  externalKey?: string | null
  referenceTime?: string | null
  currency?: string | null
  paymentMethodId?: string | null
  name?: string | null
  email?: string | null
  phone?: string | null
  [k: string]: unknown
}

export function transformCustomer(raw: RawKillbillAccount): Customer {
  const id = requireId(raw.accountId, 'accountId', 'account')
  const currency = str(raw.currency)
  return {
    id,
    externalId: id,
    email: str(raw.email),
    name: str(raw.name),
    phone: str(raw.phone),
    currency: currency ? currency.toUpperCase() : undefined,
    defaultPaymentMethodId: str(raw.paymentMethodId),
    gateway: 'killbill',
    metadata: {},
    createdAt: toIsoDatetime(raw.referenceTime),
    raw,
  }
}
