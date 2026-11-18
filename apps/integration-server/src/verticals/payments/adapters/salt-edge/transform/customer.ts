import { toIsoDatetime } from '@opensteward/shared'
import type { Customer } from '../../../schema/customer'
import { strMap } from './shared'

/**
 * Salt Edge customer (Account Information API v6). A customer is the holder
 * of one or more bank connections; `identifier` is the client-chosen unique
 * reference. There is no email/phone/name on the Salt Edge object — those
 * live on the bank-side holder info, not the customer record.
 *
 * https://docs.saltedge.com/v6/api_reference/#customers
 */
export interface RawSaltEdgeCustomer {
  id?: string | number
  identifier?: string
  secret?: string
  blocked_at?: string | null
  created_at?: string
  updated_at?: string
  [k: string]: unknown
}

export function transformCustomer(raw: RawSaltEdgeCustomer): Customer {
  const id = String(raw.id ?? '')
  return {
    id,
    externalId: id,
    name: raw.identifier || undefined,
    gateway: 'salt-edge',
    metadata: strMap({
      identifier: raw.identifier,
      blocked_at: raw.blocked_at,
    }),
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.updated_at),
    raw,
  }
}
