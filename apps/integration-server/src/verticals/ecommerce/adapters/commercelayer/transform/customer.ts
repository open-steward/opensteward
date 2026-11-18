/**
 * Commerce Layer Customer → canonical Customer.
 *
 * Commerce Layer customers are individual people with email, name, and
 * optional metadata. They map cleanly to the canonical Customer schema.
 */

import type { Customer } from '../../../schema/customer'
import { toIsoDatetime } from '@opensteward/shared'

export interface RawCLCustomer {
  id: string
  email?: string
  password?: string
  status?: string
  has_password?: boolean
  total_orders_count?: number
  created_at?: string
  updated_at?: string
  _type?: string
  _relationships?: Record<string, unknown>
  [key: string]: unknown
}

export function transformCustomer(raw: RawCLCustomer): Customer {
  // Commerce Layer stores customer metadata but not first/last names on the
  // customer resource itself — names come from addresses. Use email as a
  // fallback display name.
  return {
    id: raw.id,
    email: raw.email,
    ordersCount: raw.total_orders_count,
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformCustomer(
  customer: Partial<Customer>,
): Record<string, unknown> {
  return {
    data: {
      type: 'customers',
      attributes: {
        email: customer.email,
      },
    },
  }
}
