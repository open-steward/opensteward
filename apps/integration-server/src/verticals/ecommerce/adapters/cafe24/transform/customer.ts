/**
 * Cafe24 customer information → canonical Customer.
 *
 * Cafe24's `GET /customers` is a lookup by `cellphone` or `member_id`, not a
 * list. The member list is customer information:
 *
 *   GET /api/v2/admin/customersprivacy               → { customersprivacy: [...] }
 *   GET /api/v2/admin/customersprivacy/{member_id}   → { customersprivacy: {...} }
 *
 * Documented fields read here (https://apidocs.cafe24.com/en/docs/admin/get-customersprivacy):
 *   shop_no "Shop Number", member_id "Member id", name "Name", phone "Office
 *   phone number", cellphone "Mobile", email "Email", city "City / Town",
 *   state "state", address1 "Address 1", address2 "Address 2", zipcode
 *   "Zipcode", country_code "Country code", group_no "Group number",
 *   created_date "Created date", last_login_date "Last login date".
 *
 * The response also carries refund bank accounts, birthdays and similar
 * personal data. None of it has a canonical field, so none of it is copied
 * into `metadata`.
 *
 * Cafe24 returns one `name`, with no documented given/family split, so it is
 * kept whole in `metadata.name` rather than split on a guess.
 */

import type { Customer } from '../../../schema/customer'
import type { Address } from '../../../schema/shared'
import { toIsoDatetime } from '@opensteward/shared'

// ── Raw Cafe24 shape ──────────────────────────────────────────────────────────

export interface RawCafe24Customer {
  shop_no?: number | null
  member_id: string
  name?: string | null
  phone?: string | null
  cellphone?: string | null
  email?: string | null
  city?: string | null
  state?: string | null
  address1?: string | null
  address2?: string | null
  zipcode?: string | null
  country_code?: string | null
  group_no?: number | null
  created_date?: string | null
  last_login_date?: string | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapAddress(raw: RawCafe24Customer): Address | undefined {
  const address: Address = {}
  if (raw.address1) address.line1 = raw.address1
  if (raw.address2) address.line2 = raw.address2
  if (raw.city) address.city = raw.city
  if (raw.state) address.region = raw.state
  if (raw.zipcode) address.postalCode = raw.zipcode
  if (raw.country_code) address.country = raw.country_code
  return Object.keys(address).length > 0 ? address : undefined
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformCustomer(raw: RawCafe24Customer): Customer {
  const metadata: Record<string, unknown> = { memberId: raw.member_id }
  if (raw.shop_no != null) metadata.shopNo = raw.shop_no
  if (raw.name) metadata.name = raw.name
  if (raw.phone) metadata.officePhone = raw.phone
  if (raw.group_no != null) metadata.groupNo = raw.group_no
  const lastLogin = toIsoDatetime(raw.last_login_date)
  if (lastLogin) metadata.lastLoginDate = lastLogin

  const customer: Customer = { id: raw.member_id, metadata }
  if (raw.email) customer.email = raw.email
  if (raw.cellphone) customer.phone = raw.cellphone
  const createdAt = toIsoDatetime(raw.created_date)
  if (createdAt) customer.createdAt = createdAt
  const address = mapAddress(raw)
  if (address) customer.defaultAddress = address
  return customer
}

/** Canonical Customer → Cafe24 customer body (for create/update). */
export function untransformCustomer(customer: Partial<Customer>): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (customer.email != null) body.email = customer.email
  const name = [customer.firstName, customer.lastName].filter(Boolean).join(' ')
  if (name) body.name = name
  if (customer.phone != null) body.mobile = customer.phone
  if (customer.defaultAddress) {
    const a = customer.defaultAddress
    body.address = {
      address1: a.line1,
      address2: a.line2,
      city: a.city,
      state: a.region,
      zipcode: a.postalCode,
      country_code: a.country,
    }
  }
  return body
}
