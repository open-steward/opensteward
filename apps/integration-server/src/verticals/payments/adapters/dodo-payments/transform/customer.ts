/**
 * Dodo Payments `Customer` → canonical `Customer`.
 *
 * Docs: https://docs.dodopayments.com/api-reference/customers/get-customers
 */
import type { Customer } from '../../../schema/customer'
import { toIsoDatetime } from '@opensteward/shared'
import { strMap } from './shared'

export interface RawDodoCustomer {
  customer_id?: string
  business_id?: string
  name?: string
  email?: string
  phone_number?: string | null
  created_at?: string
  metadata?: Record<string, unknown>
  [k: string]: unknown
}

export function transformCustomer(raw: RawDodoCustomer): Customer {
  return {
    id: String(raw.customer_id ?? ''),
    externalId: String(raw.customer_id ?? ''),
    email: raw.email ?? undefined,
    name: raw.name ?? undefined,
    phone: raw.phone_number ?? undefined,
    gateway: 'dodo-payments',
    metadata: strMap(raw.metadata),
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.created_at),
    raw,
  }
}

/** Canonical `Customer` → Dodo create/update body. */
export function untransformCustomer(data: Partial<Customer>): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (data.name !== undefined) body.name = data.name
  if (data.email !== undefined) body.email = data.email
  if (data.phone !== undefined) body.phone_number = data.phone
  if (data.metadata !== undefined) body.metadata = data.metadata
  return body
}
