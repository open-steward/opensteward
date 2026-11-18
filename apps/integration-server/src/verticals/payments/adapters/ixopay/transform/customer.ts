import type { Customer } from '../../../schema/customer'
import { toIsoDatetime } from '@opensteward/shared'
import { pickStr, strMap } from './shared'

/**
 * An IXOPAY stored customer profile (returned by `customerProfiles/getProfile`).
 * The profile is keyed by the merchant-chosen `customerIdentification`; IXOPAY
 * also assigns a `profileGuid`. Personal data sits under `customerData`.
 */
export interface RawIxopayCustomer {
  profileGuid?: string
  customerIdentification?: string
  customerData?: {
    firstName?: string
    lastName?: string
    email?: string
    phone?: string
    billingCountry?: string
    [k: string]: unknown
  }
  createdAt?: string
  updatedAt?: string
  extraData?: Record<string, unknown>
  [k: string]: unknown
}

export function transformCustomer(raw: RawIxopayCustomer): Customer {
  const data = raw.customerData ?? {}
  const name = [data.firstName, data.lastName].filter(Boolean).join(' ').trim()
  return {
    id: String(raw.customerIdentification ?? raw.profileGuid ?? ''),
    externalId: String(raw.profileGuid ?? raw.customerIdentification ?? ''),
    email: pickStr(data.email),
    name: name || undefined,
    phone: pickStr(data.phone),
    gateway: 'ixopay',
    metadata: strMap({
      profileGuid: raw.profileGuid,
      customerIdentification: raw.customerIdentification,
      ...raw.extraData,
    }),
    createdAt: toIsoDatetime(raw.createdAt),
    updatedAt: toIsoDatetime(raw.updatedAt),
    raw,
  }
}
