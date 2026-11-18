import type { Customer } from '../../../schema/customer'
import { strMap } from './shared'

export interface RawIuguCustomer {
  [k: string]: unknown
}

export function transformCustomer(raw: RawIuguCustomer): Customer {
  return {
    id: String(raw['id'] ?? ''),
    externalId: String(raw['id'] ?? ''),
    email: raw['email'] != null ? String(raw['email']) : undefined,
    name: raw['name'] != null ? String(raw['name']) : undefined,
    gateway: 'iugu',
    metadata: strMap(raw['metadata'] ?? raw['extra'] ?? {}),
    createdAt: raw['created_at'] != null ? String(raw['created_at']) : undefined,
    raw,
  }
}
