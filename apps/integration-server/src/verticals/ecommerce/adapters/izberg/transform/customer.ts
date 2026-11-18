/**
 * IZBERG User → canonical Customer.
 *
 * IZBERG exposes buyers through the `user` resource. Merchants can read buyer
 * profiles associated with their orders via GET /v1/user/{id}/.
 *
 * Note: merchants do not typically create/delete users on the platform.
 * `untransformCustomer` is provided for completeness (profile update flows).
 *
 * Docs: https://docs-api-merchant.izberg-marketplace.com/
 */

import { toIsoDatetime } from '@opensteward/shared'
import type { Customer } from '../../../schema/customer'

// ── Raw IZBERG shape ─────────────────────────────────────────────────────────

export interface RawIzbergUser {
  id: number | string
  resource_uri?: string
  username?: string | null
  email?: string | null
  first_name?: string | null
  last_name?: string | null
  phone?: string | null
  date_joined?: string | null
  [key: string]: unknown
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformCustomer(raw: RawIzbergUser): Customer {
  return {
    id: String(raw.id),
    email: raw.email ?? undefined,
    firstName: raw.first_name ?? undefined,
    lastName: raw.last_name ?? undefined,
    phone: raw.phone ?? undefined,
    createdAt: toIsoDatetime(raw.date_joined),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/** Canonical Customer → IZBERG user body (for update). */
export function untransformCustomer(customer: Partial<Customer>): Record<string, unknown> {
  return {
    email: customer.email,
    first_name: customer.firstName,
    last_name: customer.lastName,
    phone: customer.phone,
  }
}
