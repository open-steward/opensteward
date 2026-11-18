import { toIsoDatetime } from '@opensteward/shared'
import type { Customer } from '../../../schema/customer'
import { pickCurrency, strMap } from './shared'

/**
 * Juspay Customer object.
 *
 * Returned by `GET /customers/{customer_id}` and `POST /customers`.
 * Fields: id, object, object_reference_id, first_name, last_name,
 * email_address, mobile_number, mobile_country_code,
 * date_created, last_updated.
 *
 * Docs: https://juspay.io/in/docs/api-reference/docs/express-checkout/getcustomer
 */
export interface RawJuspayCustomer {
  id?: string
  object?: string
  object_reference_id?: string
  first_name?: string | null
  last_name?: string | null
  email_address?: string | null
  mobile_number?: string | null
  mobile_country_code?: string | null
  date_created?: string | null
  last_updated?: string | null
  [k: string]: unknown
}

export function transformCustomer(raw: RawJuspayCustomer): Customer {
  const firstName = raw.first_name ?? ''
  const lastName = raw.last_name ?? ''
  const name = [firstName, lastName].filter(Boolean).join(' ') || undefined

  const phone =
    raw.mobile_number
      ? raw.mobile_country_code
        ? `+${raw.mobile_country_code}${raw.mobile_number}`
        : raw.mobile_number
      : undefined

  return {
    id: String(raw.object_reference_id ?? raw.id ?? ''),
    externalId: String(raw.id ?? raw.object_reference_id ?? ''),
    email: raw.email_address ?? undefined,
    name: name ?? undefined,
    phone: phone ?? undefined,
    defaultPaymentMethodId: undefined,
    billingAddress: undefined,
    shippingAddress: undefined,
    currency: pickCurrency(undefined) === 'INR' ? 'INR' : undefined,
    balance: undefined,
    delinquent: undefined,
    description: undefined,
    gateway: 'juspay',
    metadata: strMap({
      mobile_country_code: raw.mobile_country_code,
      object_reference_id: raw.object_reference_id,
    }),
    createdAt: toIsoDatetime(raw.date_created),
    updatedAt: toIsoDatetime(raw.last_updated),
    raw,
  }
}
