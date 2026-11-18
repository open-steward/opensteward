/**
 * InSales Client → canonical Customer.
 *
 * InSales calls customers "clients" (`/admin/clients.json`). Each client has
 * a name (first name), surname (last name), email, phone, and optional
 * addresses nested under `addresses[]`.
 */

import type { Customer } from '../../../schema/customer'
import type { Address } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'

export interface RawInsalesAddress {
  name?: string | null
  surname?: string | null
  phone?: string | null
  // InSales stores the street address as `address` or `delivery_address`
  address?: string | null
  delivery_address?: string | null
  city?: string | null
  country?: string | null
  country_name?: string | null
  state?: string | null
  zip?: string | null
  [key: string]: unknown
}

export interface RawInsalesClient {
  id: number | string
  name?: string | null
  surname?: string | null
  middlename?: string | null
  email?: string | null
  phone?: string | null
  // InSales stores bonus / loyalty points but not total spent; some
  // integrations include orders_count and total_price separately.
  orders_count?: number | null
  total_price?: string | number | null
  bonus_points?: number | null
  subscribe?: boolean | null
  registered?: boolean | null
  default_address?: RawInsalesAddress | null
  addresses?: RawInsalesAddress[]
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

function mapAddress(raw: RawInsalesAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = raw.address ?? raw.delivery_address ?? undefined
  const city = raw.city ?? undefined
  const country = raw.country ?? raw.country_name ?? undefined
  const postalCode = raw.zip ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return {
    line1,
    city,
    region: raw.state ?? undefined,
    postalCode,
    country,
  }
}

function toNum(v: string | number | null | undefined): number | undefined {
  if (v == null) return undefined
  const n = typeof v === 'string' ? parseFloat(v) : v
  return Number.isFinite(n) ? n : undefined
}

export function transformClient(raw: RawInsalesClient): Customer {
  const totalPriceNum = toNum(raw.total_price)
  return {
    id: String(raw.id),
    email: raw.email ?? undefined,
    firstName: raw.name ?? undefined,
    lastName: raw.surname ?? undefined,
    phone: raw.phone ?? undefined,
    acceptsMarketing: raw.subscribe ?? undefined,
    ordersCount: raw.orders_count ?? undefined,
    totalSpent:
      totalPriceNum != null
        ? { amount: majorToMinor(totalPriceNum, 'RUB'), currency: 'RUB' }
        : undefined,
    defaultAddress: mapAddress(raw.default_address),
    addresses: raw.addresses
      ?.map((a) => mapAddress(a))
      .filter((a): a is Address => !!a),
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Customer → InSales client body (for create/update). */
export function untransformClient(customer: Partial<Customer>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    name: customer.firstName,
    surname: customer.lastName,
    email: customer.email,
    phone: customer.phone,
    subscribe: customer.acceptsMarketing,
  }
  if (customer.defaultAddress) {
    const a = customer.defaultAddress
    body.addresses_attributes = [
      {
        address: a.line1,
        city: a.city,
        state: a.region,
        zip: a.postalCode,
        country: a.country,
      },
    ]
  }
  return body
}
