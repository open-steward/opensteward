import { toIsoDatetime } from '@opensteward/shared'
import type { Customer } from '../../../schema/customer'
import type { Address } from '../../../schema/shared'
import { strMap } from './shared'

/**
 * A HitPay customer record — created/fetched via `POST /v1/customers` /
 * `GET /v1/customers/{id}`.
 *
 * Docs: https://docs.hitpayapp.com/apis/customers/get-all-customer
 */
export interface RawHitpayCustomer {
  id?: string
  name?: string
  email?: string
  phone_number?: string
  phone_number_country_code?: string
  birth_date?: string
  gender?: string
  remark?: string
  address?: {
    city?: string
    state?: string
    street?: string
    postal_code?: string
    country?: string
  }
  created_at?: string
  updated_at?: string
  [k: string]: unknown
}

function mapAddress(addr: RawHitpayCustomer['address']): Address | undefined {
  if (!addr) return undefined
  const line1 = addr.street ?? undefined
  const city = addr.city ?? undefined
  const region = addr.state ?? undefined
  const postalCode = addr.postal_code ?? undefined
  const country = addr.country ?? undefined
  if (!line1 && !city && !region && !postalCode && !country) return undefined
  return { line1, city, region, postalCode, country }
}

export function transformCustomer(raw: RawHitpayCustomer): Customer {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    email: raw.email ?? undefined,
    name: raw.name ?? undefined,
    phone: raw.phone_number ?? undefined,
    defaultPaymentMethodId: undefined,
    billingAddress: mapAddress(raw.address),
    shippingAddress: undefined,
    currency: undefined,
    balance: undefined,
    delinquent: undefined,
    description: raw.remark ?? undefined,
    gateway: 'hitpay',
    metadata: strMap({
      birth_date: raw.birth_date,
      gender: raw.gender,
      phone_number_country_code: raw.phone_number_country_code,
    }),
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.updated_at),
    raw,
  }
}
