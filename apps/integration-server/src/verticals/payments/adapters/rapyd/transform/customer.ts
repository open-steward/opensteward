import type { Customer } from '../../../schema/customer'
import { pickStr, strMap, toIsoDatetime } from './shared'

/**
 * Rapyd Customer object (subset). `id` starts with `cus_`; `created_at` is
 * Unix seconds. Docs: https://docs.rapyd.net/en/retrieve-customer.html
 */
export interface RawRapydCustomer {
  id?: string
  name?: string
  email?: string
  phone_number?: string
  default_payment_method?: string
  description?: string
  delinquent?: boolean
  created_at?: number
  metadata?: Record<string, unknown>
  [k: string]: unknown
}

export function transformCustomer(raw: RawRapydCustomer): Customer {
  const id = pickStr(raw.id) ?? ''
  return {
    id,
    externalId: id,
    email: pickStr(raw.email),
    name: pickStr(raw.name),
    phone: pickStr(raw.phone_number),
    defaultPaymentMethodId: pickStr(raw.default_payment_method),
    delinquent: typeof raw.delinquent === 'boolean' ? raw.delinquent : undefined,
    description: pickStr(raw.description),
    gateway: 'rapyd',
    metadata: strMap(raw.metadata),
    createdAt: toIsoDatetime(raw.created_at),
    raw,
  }
}
