/**
 * Salla Customer → canonical Customer.
 *
 * Salla customer fields:
 *  - id, first_name, last_name, mobile, mobile_code, email
 *  - city, country, country_code, location (address string)
 *  - updated_at (date object)
 *  - groups[] (group IDs)
 */

import type { Customer } from '../../../schema/customer'
import type { Address } from '../../../schema/shared'
import { toIsoDatetime } from '@opensteward/shared'

// ── Raw Salla shapes ─────────────────────────────────────────────────────────

export interface RawSallaCustomerDateObj {
  date?: string
  timezone?: string
}

export interface RawSallaCustomer {
  id: number | string
  first_name?: string | null
  last_name?: string | null
  mobile?: number | string | null
  mobile_code?: string | null
  email?: string | null
  city?: string | null
  country?: string | null
  country_code?: string | null
  location?: string | null
  currency?: string | null
  avatar?: string | null
  updated_at?: RawSallaCustomerDateObj | string | null
  groups?: Array<number | string>
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseSallaDate(date: RawSallaCustomerDateObj | string | null | undefined): string | undefined {
  if (!date) return undefined
  if (typeof date === 'string') return toIsoDatetime(date)
  if (date.date) {
    return toIsoDatetime(date.date)
  }
  return undefined
}

function mapAddress(raw: RawSallaCustomer): Address | undefined {
  const city = raw.city ?? undefined
  const country = raw.country_code ?? raw.country ?? undefined
  const line1 = raw.location ?? undefined
  if (!city && !country && !line1) return undefined
  return { line1, city, country }
}

// ── Transforms ───────────────────────────────────────────────────────────────

export function transformCustomer(raw: RawSallaCustomer): Customer {
  const phone = raw.mobile != null
    ? [raw.mobile_code, raw.mobile].filter(Boolean).join('')
    : undefined

  return {
    id: String(raw.id),
    email: raw.email ?? undefined,
    firstName: raw.first_name ?? undefined,
    lastName: raw.last_name ?? undefined,
    phone: phone || undefined,
    defaultAddress: mapAddress(raw),
    updatedAt: parseSallaDate(raw.updated_at),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Customer → Salla customer body (for create/update). */
export function untransformCustomer(customer: Partial<Customer>): Record<string, unknown> {
  return {
    first_name: customer.firstName,
    last_name: customer.lastName,
    email: customer.email,
    mobile: customer.phone,
    city: customer.defaultAddress?.city,
    country: customer.defaultAddress?.country,
  }
}
