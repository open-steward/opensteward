import type { Customer } from '../../../schema/customer'
import { strMap } from './shared'

export interface RawPinCustomer {
  [k: string]: unknown
}

export function transformCustomer(raw: RawPinCustomer): Customer {
  return {
    id: String(raw['token'] ?? ''),
    externalId: String(raw['token'] ?? ''),
    email: raw['email'] != null ? String(raw['email']) : undefined,
    name: raw['first_name'] != null ? String(raw['first_name']) : undefined,
    gateway: 'pin-payments',
    metadata: strMap(raw['metadata'] ?? raw['extra'] ?? {}),
    createdAt: raw['created_at'] != null ? String(raw['created_at']) : undefined,
    raw,
  }
}
