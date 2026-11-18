import type { Customer } from '../../../schema/customer'
import { strMap } from './shared'

export interface RawOpnCustomer {
  [k: string]: unknown
}

export function transformCustomer(raw: RawOpnCustomer): Customer {
  return {
    id: String(raw['id'] ?? ''),
    externalId: String(raw['id'] ?? ''),
    email: raw['email'] != null ? String(raw['email']) : undefined,
    name: raw['description'] != null ? String(raw['description']) : undefined,
    gateway: 'opn-payments',
    metadata: strMap(raw['metadata'] ?? raw['extra'] ?? {}),
    createdAt: raw['created'] != null ? String(raw['created']) : undefined,
    raw,
  }
}
