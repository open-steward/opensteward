/**
 * CartPanda Customer → canonical Customer.
 *
 * The Customer resource stores information about a shop's customers,
 * including contact details, order history, and marketing preferences.
 *
 * Docs: https://dev.cartpanda.com/docs/cartx-api-doc/da7b28dfc3060-list-customers
 */

import type { Customer } from '../../../schema/customer'
import type { Address } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'

export interface RawCartpandaAddress {
  address1?: string | null
  address2?: string | null
  city?: string | null
  province?: string | null
  province_code?: string | null
  zip?: string | null
  country?: string | null
  country_code?: string | null
  [key: string]: unknown
}

export interface RawCartpandaCustomer {
  id: number | string
  email?: string | null
  first_name?: string | null
  last_name?: string | null
  phone?: string | null
  accepts_marketing?: boolean
  orders_count?: number
  total_spent?: string | number
  /** ISO 4217 currency code. Defaults to BRL for CartPanda stores. */
  currency?: string
  tags?: string
  default_address?: RawCartpandaAddress | null
  addresses?: RawCartpandaAddress[]
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

function mapAddress(raw: RawCartpandaAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.address1 ?? undefined
  const line2 = raw.address2 ?? undefined
  const city = raw.city ?? undefined
  const region = raw.province ?? raw.province_code ?? undefined
  const postalCode = raw.zip ?? undefined
  const country = raw.country_code ?? raw.country ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return { line1, line2, city, region, postalCode, country }
}

function splitTags(tags: string | undefined): string[] | undefined {
  if (!tags) return undefined
  return tags
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
}

export function transformCustomer(raw: RawCartpandaCustomer): Customer {
  const currency = raw.currency ?? 'BRL'
  const totalSpentNum =
    typeof raw.total_spent === 'string' ? parseFloat(raw.total_spent) : raw.total_spent
  return {
    id: String(raw.id),
    email: raw.email ?? undefined,
    firstName: raw.first_name ?? undefined,
    lastName: raw.last_name ?? undefined,
    phone: raw.phone ?? undefined,
    acceptsMarketing: raw.accepts_marketing,
    ordersCount: raw.orders_count,
    totalSpent:
      totalSpentNum != null && !Number.isNaN(totalSpentNum)
        ? {
            amount: majorToMinor(totalSpentNum, currency),
            currency,
          }
        : undefined,
    tags: splitTags(raw.tags),
    defaultAddress: mapAddress(raw.default_address),
    addresses: raw.addresses?.map((a) => mapAddress(a)).filter((a): a is Address => !!a),
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformCustomer(customer: Partial<Customer>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    email: customer.email,
    first_name: customer.firstName,
    last_name: customer.lastName,
    phone: customer.phone,
    accepts_marketing: customer.acceptsMarketing,
  }
  if (customer.tags) body.tags = customer.tags.join(', ')
  if (customer.defaultAddress) {
    const a = customer.defaultAddress
    body.addresses = [
      {
        address1: a.line1,
        address2: a.line2,
        city: a.city,
        province: a.region,
        zip: a.postalCode,
        country_code: a.country,
      },
    ]
  }
  return body
}
