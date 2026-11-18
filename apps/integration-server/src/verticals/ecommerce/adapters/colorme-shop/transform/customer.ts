/**
 * ColorMe Shop Customer → canonical Customer.
 *
 * Docs: OpenAPI spec paths["/v1/customers"]. ColorMe stores one `name` field
 * (Japanese full name, not split first/last) — mapped onto `firstName` with
 * `lastName` left undefined rather than guessing a split point. Every
 * address is Japan-only (`pref_id`/`pref_name`, no country field anywhere in
 * the spec) — `country: 'JP'` is a verified platform fact, not a default.
 */

import type { Customer } from '../../../schema/customer'
import type { Address } from '../../../schema/shared'

export interface RawColormeCustomer {
  id: number
  name?: string | null
  mail?: string | null
  tel?: string | null
  postal?: string | null
  address1?: string | null
  address2?: string | null
  pref_name?: string | null
  receive_mail_magazine?: boolean | null
  sales_count?: number
  make_date?: number
  update_date?: number
}

function unixToIso(seconds: number | undefined): string | undefined {
  return seconds != null ? new Date(seconds * 1000).toISOString() : undefined
}

function mapAddress(raw: RawColormeCustomer): Address | undefined {
  if (!raw.address1 && !raw.postal) return undefined
  return {
    line1: raw.address1 ?? undefined,
    line2: raw.address2 ?? undefined,
    region: raw.pref_name ?? undefined,
    postalCode: raw.postal ?? undefined,
    country: 'JP',
  }
}

export function transformCustomer(raw: RawColormeCustomer): Customer {
  return {
    id: String(raw.id),
    email: raw.mail ?? undefined,
    firstName: raw.name ?? undefined,
    phone: raw.tel ?? undefined,
    acceptsMarketing: raw.receive_mail_magazine ?? undefined,
    ordersCount: raw.sales_count,
    defaultAddress: mapAddress(raw),
    createdAt: unixToIso(raw.make_date),
    updatedAt: unixToIso(raw.update_date),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformCustomer(customer: Partial<Customer>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    name: customer.firstName,
    mail: customer.email,
    tel: customer.phone,
  }
  if (customer.defaultAddress) {
    body.postal = customer.defaultAddress.postalCode
    body.address1 = customer.defaultAddress.line1
    body.address2 = customer.defaultAddress.line2
  }
  return body
}
