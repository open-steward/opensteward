/**
 * EverShop Customer → canonical Customer.
 *
 * EverShop customers have a `full_name` (not split), `email`, `status`,
 * and `group_id`. There is no direct address embedded in the customer object
 * from the admin API; the adapter maps what is available.
 *
 * Docs: https://evershop.io/docs/api/customer
 */

import type { Customer } from '../../../schema/customer'
import { toIsoDatetime } from '@opensteward/shared'

export interface RawEverShopCustomer {
  customer_id?: number | string
  uuid?: string
  email?: string | null
  full_name?: string | null
  status?: number | string | boolean | null
  group_id?: number | string | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

/** Split "First Last" into firstName/lastName. */
function splitName(full: string | null | undefined): { firstName?: string; lastName?: string } {
  if (!full) return {}
  const parts = full.trim().split(/\s+/)
  if (parts.length === 1) return { firstName: parts[0] }
  const firstName = parts[0]
  const lastName = parts.slice(1).join(' ')
  return { firstName, lastName }
}

export function transformCustomer(raw: RawEverShopCustomer): Customer {
  const id = raw.uuid ?? (raw.customer_id != null ? String(raw.customer_id) : String(raw.email ?? ''))
  const { firstName, lastName } = splitName(raw.full_name)

  return {
    id,
    email: raw.email ?? undefined,
    firstName,
    lastName,
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.updated_at),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Customer → EverShop customer body (for create/update). */
export function untransformCustomer(customer: Partial<Customer>): Record<string, unknown> {
  const fullName = [customer.firstName, customer.lastName].filter(Boolean).join(' ') || undefined
  return {
    email: customer.email,
    full_name: fullName,
    status: 1,
  }
}
