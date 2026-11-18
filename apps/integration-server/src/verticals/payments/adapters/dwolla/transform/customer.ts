/**
 * Dwolla Customer -> canonical Customer.
 *
 * Fields per the `BaseCustomer` / `VerifiedPersonalCustomer` /
 * `VerifiedBusinessCustomer` schemas of GET /customers and GET /customers/{id}
 * (https://developers.dwolla.com/docs/api-reference/customers/list-and-search-customers):
 * BaseCustomer requires `id`, `firstName`, `lastName`, `email`, `created`;
 * verified customers add `address1`, `address2`, `city`, `state`,
 * `postalCode`; business customers add `businessName` and `phone`; every
 * type carries `type` and `status`.
 */

import type { Customer } from '../../../schema/customer'
import { toIsoDatetime, pickStr } from './shared'

export interface RawDwollaCustomer {
  id: string
  firstName?: string | null
  lastName?: string | null
  email?: string | null
  businessName?: string | null
  phone?: string | null
  type?: string | null
  status?: string | null
  correlationId?: string | null
  created?: string | null
  address1?: string | null
  address2?: string | null
  city?: string | null
  state?: string | null
  postalCode?: string | null
  [key: string]: unknown
}

function personName(raw: RawDwollaCustomer): string | undefined {
  const parts = [pickStr(raw.firstName), pickStr(raw.lastName)].filter(Boolean)
  return parts.length ? parts.join(' ') : undefined
}

export function transformCustomer(raw: RawDwollaCustomer): Customer {
  if (typeof raw.id !== 'string' || !raw.id) {
    throw new Error('Dwolla customer carried no id.')
  }
  const hasAddress = [raw.address1, raw.address2, raw.city, raw.state, raw.postalCode].some(
    (v) => typeof v === 'string' && v,
  )
  const metadata: Record<string, string> = {}
  for (const key of ['type', 'status', 'correlationId'] as const) {
    const v = pickStr(raw[key])
    if (v) metadata[key] = v
  }
  return {
    id: raw.id,
    externalId: raw.id,
    email: pickStr(raw.email),
    name: pickStr(raw.businessName) ?? personName(raw),
    phone: pickStr(raw.phone),
    billingAddress: hasAddress
      ? {
          line1: pickStr(raw.address1),
          line2: pickStr(raw.address2),
          city: pickStr(raw.city),
          region: pickStr(raw.state),
          postalCode: pickStr(raw.postalCode),
        }
      : undefined,
    gateway: 'dwolla',
    metadata,
    createdAt: toIsoDatetime(raw.created),
    raw,
  }
}
