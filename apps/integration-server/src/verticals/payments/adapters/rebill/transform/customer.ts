/**
 * Rebill customer → canonical Customer.
 *
 * The customer object (https://docs.rebill.com/api/reference/customers):
 * `id` ("Prefixed with `cus_`"), `firstName`, `lastName`, `email`,
 * `metadata` ("`null` when not set"), `createdAt` ("ISO 8601 timestamp of
 * customer creation").
 */
import type { Customer } from '../../../schema/customer'
import { strMap } from './shared'

export interface RawRebillCustomer {
  id: string
  firstName?: string | null
  lastName?: string | null
  email?: string | null
  metadata?: Record<string, unknown> | null
  createdAt?: string | null
  [k: string]: unknown
}

export function transformCustomer(raw: RawRebillCustomer): Customer {
  if (typeof raw.id !== 'string' || raw.id === '') {
    throw new Error('Rebill customer has no id')
  }
  const name = [raw.firstName, raw.lastName].filter((p): p is string => !!p).join(' ')
  return {
    id: raw.id,
    externalId: raw.id,
    email: raw.email ?? undefined,
    name: name || undefined,
    gateway: 'rebill',
    metadata: strMap(raw.metadata),
    createdAt: raw.createdAt ?? undefined,
    raw,
  }
}
