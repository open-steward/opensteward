/**
 * Sapo Customer → canonical Customer.
 *
 * Sapo uses `created_on` / `modified_on` for timestamps (not `created_at` /
 * `updated_at`) and VND as the default currency for Vietnamese stores.
 * The address shape matches Shopify's field names.
 *
 * Docs: https://support.sapo.vn/customer
 */

import type { Customer } from '../../../schema/customer'
import type { Address } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'

export interface RawSapoAddress {
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

export interface RawSapoCustomer {
  id: number | string
  email?: string | null
  first_name?: string | null
  last_name?: string | null
  phone?: string | null
  accepts_marketing?: boolean
  orders_count?: number
  total_spent?: string | number
  currency?: string
  tags?: string
  state?: string
  note?: string | null
  default_address?: RawSapoAddress | null
  addresses?: RawSapoAddress[]
  /** Sapo uses `created_on`, not `created_at`. */
  created_on?: string
  /** Sapo uses `modified_on`, not `updated_at`. */
  modified_on?: string
  [key: string]: unknown
}

function mapAddress(raw: RawSapoAddress | null | undefined): Address | undefined {
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

export function transformCustomer(raw: RawSapoCustomer): Customer {
  const currency = raw.currency ?? 'VND'
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
        ? { amount: majorToMinor(totalSpentNum, currency), currency }
        : undefined,
    tags: splitTags(raw.tags),
    defaultAddress: mapAddress(raw.default_address),
    addresses: raw.addresses?.map((a) => mapAddress(a)).filter((a): a is Address => !!a),
    createdAt: raw.created_on,
    updatedAt: raw.modified_on,
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
