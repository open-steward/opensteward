/**
 * Dukaan audience member (store lead) → canonical Customer.
 *
 * Two documented shapes, both keyed by the numeric store-lead `id`: the
 * audience list row's `id` (21881957 in the example) is the id
 * get_customer_details reads at /api/campaign/seller/store-lead/v2/store-lead-data/21881957/.
 *
 *  - a row of get_store_audience_list, GET /api/store/seller/store-buyer/
 *  - `data` of get_customer_details
 *
 * `orders_total_cost` carries no currency, so `totalSpent` is not mapped.
 *
 * Docs: https://documenter.getpostman.com/view/25389466/2s9Yynk3f7
 */

import type { Customer } from '../../../schema/customer'
import type { Address } from '../../../schema/shared'
import { toIsoDatetime } from '@opensteward/shared'

// ── Raw Dukaan shapes (fields as in the documented example responses) ────────

/** A row of get_store_audience_list. */
export interface RawDukaanAudienceRow {
  id: number
  uuid: string
  mobile: string | null
  email: string | null
  name: string | null
  city: string | null
  state: string | null
  pin: string | null
  address_line: string | null
  created_at: string
  orders: number
  orders_total_cost: number
  [key: string]: unknown
}

/** `data` of get_customer_details. */
export interface RawDukaanStoreLead {
  id: number
  uuid: string
  created_at: string
  modified_at: string
  name: string | null
  city: string | null
  mobile: string | null
  email: string | null
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function text(v: string | null | undefined): string | undefined {
  return typeof v === 'string' && v.trim() !== '' ? v : undefined
}

/** Dukaan has one `name` field; the first word is the first name, the rest the last. */
function splitName(name: string | null | undefined): { firstName?: string; lastName?: string } {
  const full = text(name)?.trim()
  if (!full) return {}
  const [first, ...rest] = full.split(/\s+/)
  return { firstName: first, lastName: rest.length > 0 ? rest.join(' ') : undefined }
}

function address(parts: Address): Address | undefined {
  return Object.values(parts).some((v) => v !== undefined) ? parts : undefined
}

// ── Transforms ────────────────────────────────────────────────────────────────

export function transformAudienceRow(raw: RawDukaanAudienceRow): Customer {
  return {
    id: String(raw.id),
    email: text(raw.email),
    ...splitName(raw.name),
    phone: text(raw.mobile),
    ordersCount: typeof raw.orders === 'number' ? raw.orders : undefined,
    defaultAddress: address({
      line1: text(raw.address_line),
      city: text(raw.city),
      region: text(raw.state),
      postalCode: text(raw.pin),
    }),
    createdAt: toIsoDatetime(raw.created_at),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function transformStoreLead(raw: RawDukaanStoreLead): Customer {
  return {
    id: String(raw.id),
    email: text(raw.email),
    ...splitName(raw.name),
    phone: text(raw.mobile),
    defaultAddress: address({ city: text(raw.city) }),
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.modified_at),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Write-side body for createCustomer / updateCustomer. Those methods are out
 * of scope for the list rebuild and still target undocumented paths.
 */
export function untransformCustomer(customer: Partial<Customer>): Record<string, unknown> {
  return {
    first_name: customer.firstName,
    last_name: customer.lastName,
    email: customer.email,
    phone: customer.phone,
    accepts_marketing: customer.acceptsMarketing,
  }
}
