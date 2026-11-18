import { toIsoDatetime } from '@opensteward/shared'
import type { Customer } from '../../../schema/customer'

/**
 * A row of GET /Query/customers/{entry}, also the body of GET
 * /Customer/{customerId}. Only the fields read here.
 * https://docs.payabli.com/developers/api-reference/customer/get-customer-record.md
 */
export interface RawPayabliCustomer {
  /** "The Payabli-generated unique ID for the customer." */
  customerId?: number | null
  Firstname?: string | null
  Lastname?: string | null
  Company?: string | null
  Phone?: string | null
  Email?: string | null
  /** "Date and time of last update." */
  LastUpdated?: string | null
  /** "Date and time created." */
  Created?: string | null
  [k: string]: unknown
}

export function transformCustomer(raw: RawPayabliCustomer): Customer {
  if (raw.customerId == null) throw new Error('Payabli customer has no customerId')
  const id = String(raw.customerId)
  const name = [raw.Firstname, raw.Lastname].filter((p) => p).join(' ')
  return {
    id,
    externalId: id,
    email: raw.Email || undefined,
    name: name || undefined,
    phone: raw.Phone || undefined,
    description: raw.Company || undefined,
    gateway: 'payabli',
    metadata: {},
    createdAt: toIsoDatetime(raw.Created),
    updatedAt: toIsoDatetime(raw.LastUpdated),
    raw,
  }
}
