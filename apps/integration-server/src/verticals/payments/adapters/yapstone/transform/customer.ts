import type { Customer } from '../../../schema/customer'
import { strMap } from './shared'

export interface RawYapstoneCustomer {
  [k: string]: unknown
}

export function transformCustomer(raw: RawYapstoneCustomer): Customer {
  return {
    id: String(raw['id'] ?? ''),
    externalId: String(raw['id'] ?? ''),
    email: raw['email'] != null ? String(raw['email']) : undefined,
    name: raw['firstName'] != null ? String(raw['firstName']) : undefined,
    gateway: 'yapstone',
    metadata: strMap(raw['metadata'] ?? raw['extra'] ?? {}),
    createdAt: raw['created'] != null ? String(raw['created']) : undefined,
    raw,
  }
}
