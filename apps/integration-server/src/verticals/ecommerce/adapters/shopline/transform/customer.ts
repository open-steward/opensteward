/**
 * SHOPLINE Customer → canonical Customer.
 *
 * SHOPLINE's customer object is very similar to Shopify's but adds `state`,
 * `language`, `asid`, and marketing consent objects. The deprecated
 * `accepts_marketing` scalar is replaced by `email_marketing_consent.state`.
 *
 * Docs:
 *   https://developer.shopline.com/docs/admin-rest-api/customer/customer-information/create-a-customer/
 */

import type { Customer } from '../../../schema/customer'
import type { Address } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'

export interface RawShoplineAddress {
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

export interface RawShoplineMarketingConsent {
  state?: string // 'subscribed' | 'unsubscribed' | 'not_subscribed' | ...
  opt_in_level?: string
}

export interface RawShoplineCustomer {
  id: number | string
  email?: string | null
  first_name?: string | null
  last_name?: string | null
  phone?: string | null
  /** Deprecated in v20250601; use email_marketing_consent.state instead. */
  accepts_marketing?: boolean
  email_marketing_consent?: RawShoplineMarketingConsent | null
  orders_count?: number
  total_spent?: string | number
  currency?: string
  tags?: string | string[]
  default_address?: RawShoplineAddress | null
  addresses?: RawShoplineAddress[]
  created_at?: string
  updated_at?: string
  state?: number | string // 0=blacklist, 1=not invited, 2=invited, 3=registered
  language?: string
  [key: string]: unknown
}

function mapAddress(raw: RawShoplineAddress | null | undefined): Address | undefined {
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

function splitTags(tags: string | string[] | undefined): string[] | undefined {
  if (!tags) return undefined
  if (Array.isArray(tags)) return tags.filter((t) => t.length > 0)
  return tags
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
}

function resolveAcceptsMarketing(raw: RawShoplineCustomer): boolean | undefined {
  // Prefer modern consent object
  if (raw.email_marketing_consent?.state != null) {
    return raw.email_marketing_consent.state === 'subscribed'
  }
  return raw.accepts_marketing
}

export function transformCustomer(raw: RawShoplineCustomer): Customer {
  const totalSpentNum =
    typeof raw.total_spent === 'string' ? parseFloat(raw.total_spent) : raw.total_spent
  return {
    id: String(raw.id),
    email: raw.email ?? undefined,
    firstName: raw.first_name ?? undefined,
    lastName: raw.last_name ?? undefined,
    phone: raw.phone ?? undefined,
    acceptsMarketing: resolveAcceptsMarketing(raw),
    ordersCount: raw.orders_count,
    totalSpent:
      totalSpentNum != null && !Number.isNaN(totalSpentNum)
        ? {
            amount: majorToMinor(totalSpentNum, raw.currency ?? 'USD'),
            currency: raw.currency ?? 'USD',
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
  }
  if (customer.acceptsMarketing != null) {
    body.email_marketing_consent = {
      state: customer.acceptsMarketing ? 'subscribed' : 'unsubscribed',
      opt_in_level: 'single_opt_in',
    }
  }
  if (customer.tags) body.tags = customer.tags.join(',')
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
