/**
 * NuORDER Company/Buyer → canonical Customer.
 *
 * A "customer" in NuORDER's B2B model is a wholesale buyer account
 * (Company), which can have several individual contacts (Buyers) attached.
 * Confirmed buyer field names (`name`, `email`, `reps`, `title`,
 * `phone_office`, `phone_cell`) are shown verbatim in
 * https://assets.nuorder.com/api-docs/index.html; company-level fields
 * beyond `id`/`code` are not shown, so only those are promoted — everything
 * else rides along in `metadata`.
 *
 * NuORDER's `name` is one string per buyer, not separate first/last fields —
 * put whole into `firstName` rather than guessing a split.
 */
import type { Customer } from '../../../schema/customer'

export interface RawNuorderBuyer {
  name?: string
  email?: string
  title?: string
  phone_office?: string
  phone_cell?: string
}

export interface RawNuorderCompany {
  id?: string | number
  code?: string
  buyers?: RawNuorderBuyer[]
}

export function transformCustomer(raw: RawNuorderCompany): Customer {
  const id = raw.id ?? raw.code
  if (id == null) {
    throw new Error('NuORDER company record has neither id nor code — cannot assign a canonical id')
  }
  const primary = raw.buyers?.[0]
  return {
    id: String(id),
    email: primary?.email,
    firstName: primary?.name,
    phone: primary?.phone_office ?? primary?.phone_cell,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical → NuORDER Company write body — only `code` (used at creation) has a confirmed name. */
export function untransformCustomer(data: Partial<Customer>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.id !== undefined) out.code = data.id
  return out
}
