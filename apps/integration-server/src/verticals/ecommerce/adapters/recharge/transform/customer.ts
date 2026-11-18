/**
 * Recharge Customer → canonical Customer.
 *
 * Recharge customer objects carry top-level first_name/last_name/email/phone
 * fields. Billing address lives under `billing_address` on the customer object.
 * Additional shipping addresses are returned when retrieved with
 * `?include=addresses`.
 *
 * Docs: https://developer.rechargepayments.com/2021-11/customers/customers_object
 */

import type { Customer } from '../../../schema/customer'
import type { Address } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'
import { toIsoDatetime } from '@opensteward/shared'

// ── Raw Recharge shapes ──────────────────────────────────────────────────────

export interface RawRechargeAddressBlock {
  address1?: string | null
  address2?: string | null
  city?: string | null
  company?: string | null
  country_code?: string | null
  first_name?: string | null
  last_name?: string | null
  phone?: string | null
  province?: string | null
  zip?: string | null
  [key: string]: unknown
}

export interface RawRechargeCustomer {
  id: number | string
  email?: string | null
  first_name?: string | null
  last_name?: string | null
  phone?: string | null
  accepts_marketing?: boolean | null
  orders_count?: number | null
  total_spent?: string | number | null
  status?: string | null
  external_customer_id?: { ecommerce?: string | null } | null
  hash?: string | null
  billing_address?: RawRechargeAddressBlock | null
  /** Included when retrieved with ?include=addresses */
  addresses?: RawRechargeAddressBlock[] | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapAddress(raw: RawRechargeAddressBlock | null | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.address1 ?? undefined
  const line2 = raw.address2 ?? undefined
  const city = raw.city ?? undefined
  const region = raw.province ?? undefined
  const postalCode = raw.zip ?? undefined
  const country = raw.country_code ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return { line1, line2, city, region, postalCode, country }
}

export function transformCustomer(raw: RawRechargeCustomer): Customer {
  const totalSpentNum =
    typeof raw.total_spent === 'string'
      ? parseFloat(raw.total_spent)
      : typeof raw.total_spent === 'number'
        ? raw.total_spent
        : undefined

  const defaultAddress = mapAddress(raw.billing_address)

  const addresses: Address[] = []
  if (defaultAddress) addresses.push(defaultAddress)
  if (raw.addresses && raw.addresses.length > 0) {
    for (const a of raw.addresses) {
      const mapped = mapAddress(a)
      if (mapped) addresses.push(mapped)
    }
  }

  return {
    id: String(raw.id),
    email: raw.email ?? undefined,
    firstName: raw.first_name ?? undefined,
    lastName: raw.last_name ?? undefined,
    phone: raw.phone ?? undefined,
    acceptsMarketing: raw.accepts_marketing ?? undefined,
    ordersCount: raw.orders_count ?? undefined,
    totalSpent:
      totalSpentNum != null && !Number.isNaN(totalSpentNum)
        ? { amount: majorToMinor(totalSpentNum, 'USD'), currency: 'USD' }
        : undefined,
    defaultAddress,
    addresses: addresses.length > 0 ? addresses : undefined,
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.updated_at),
    metadata: raw as Record<string, unknown>,
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
  if (customer.defaultAddress) {
    const a = customer.defaultAddress
    body['billing_address'] = {
      first_name: customer.firstName,
      last_name: customer.lastName,
      address1: a.line1,
      address2: a.line2,
      city: a.city,
      province: a.region,
      zip: a.postalCode,
      country_code: a.country,
      phone: customer.phone,
    }
  }
  return body
}
