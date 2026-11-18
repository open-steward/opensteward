import { toIsoDatetime } from '@opensteward/shared'
import type { Customer } from '../../../schema/customer'
import { strMap } from './shared'

/**
 * Cashfree Customer entity (`POST /customers`).
 *
 * Cashfree's PG API supports creating customers via `POST /customers`, which
 * returns a `CustomerEntity` with a gateway-assigned `customer_uid`. There is
 * no `GET /customers/{id}` or list customers endpoint — customer data is
 * embedded in orders and subscriptions. Only `createCustomer` is available.
 */
export interface RawCashfreeCustomer {
  customer_uid?: string
  customer_phone?: string
  customer_email?: string
  customer_name?: string
  created_at?: string
  [k: string]: unknown
}

export function transformCustomer(raw: RawCashfreeCustomer): Customer {
  const id = String(raw.customer_uid ?? '')

  return {
    id,
    externalId: id,
    email: raw.customer_email ?? null,
    name: raw.customer_name ?? null,
    phone: raw.customer_phone ?? null,
    defaultPaymentMethodId: null,
    billingAddress: null,
    shippingAddress: null,
    currency: null,
    description: null,
    gateway: 'cashfree',
    metadata: strMap({
      customer_phone: raw.customer_phone,
    }),
    createdAt: toIsoDatetime(raw.created_at) ?? null,
    updatedAt: null,
    raw,
  }
}
