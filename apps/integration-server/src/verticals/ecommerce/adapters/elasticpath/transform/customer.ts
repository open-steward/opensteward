/**
 * Elastic Path Customer → canonical Customer.
 *
 * Elastic Path customers live at `/v2/customers`. Response shape:
 *   { id, type: 'customer', name, email, password, ... }
 *
 * Note: Elastic Path stores a single `name` field rather than
 * separate first/last. We split on the first space.
 */

import type { Customer } from '../../../schema/customer'
import { toIsoDatetime } from '@opensteward/shared'

export interface RawEpCustomer {
  id: string
  type: string // customer
  name?: string
  email?: string
  password?: boolean
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

function splitName(name: string | undefined): { firstName?: string; lastName?: string } {
  if (!name) return {}
  const idx = name.indexOf(' ')
  if (idx < 0) return { firstName: name }
  return { firstName: name.slice(0, idx), lastName: name.slice(idx + 1) }
}

export function transformCustomer(raw: RawEpCustomer): Customer {
  const { firstName, lastName } = splitName(raw.name)
  return {
    id: raw.id,
    email: raw.email,
    firstName,
    lastName,
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformCustomer(
  customer: Partial<Customer>,
): Record<string, unknown> {
  const nameParts = [customer.firstName, customer.lastName].filter(Boolean)
  return {
    data: {
      type: 'customer',
      name: nameParts.join(' ') || undefined,
      email: customer.email,
    },
  }
}
