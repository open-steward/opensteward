/**
 * Rebilly customer → canonical Customer (components/schemas/Customer.yaml:
 * `email` "Customer's email address.", `firstName`, `lastName`, `createdTime`,
 * `updatedTime`, `customFields`).
 */
import type { Customer } from '../../../schema/customer'
import { fullName, requireId, str, strMap } from './shared'

export interface RawRebillyCustomer {
  id?: string
  email?: string | null
  firstName?: string | null
  lastName?: string | null
  customFields?: Record<string, unknown>
  createdTime?: string
  updatedTime?: string
  [k: string]: unknown
}

export function transformCustomer(raw: RawRebillyCustomer): Customer {
  const id = requireId(raw.id, 'customer id')
  return {
    id,
    externalId: id,
    email: str(raw.email),
    name: fullName(raw.firstName, raw.lastName),
    gateway: 'rebilly',
    metadata: strMap(raw.customFields),
    createdAt: str(raw.createdTime),
    updatedAt: str(raw.updatedTime),
    raw,
  }
}
