import { toIsoDatetime } from '@opensteward/shared'
import type { Customer } from '../../../schema/customer'
import { strMap } from './shared'

/**
 * Xendit Customer object (Customers API).
 * https://docs.xendit.co/apidocs/get-customer-id
 */
export interface RawXenditCustomer {
  id?: string
  reference_id?: string
  type?: 'INDIVIDUAL' | 'BUSINESS' | string
  email?: string | null
  mobile_number?: string | null
  phone_number?: string | null
  given_names?: string | null
  surname?: string | null
  description?: string | null
  individual_detail?: {
    given_names?: string | null
    surname?: string | null
  } | null
  business_detail?: {
    business_name?: string | null
  } | null
  metadata?: Record<string, unknown> | null
  created?: string | null
  updated?: string | null
  [k: string]: unknown
}

function deriveName(raw: RawXenditCustomer): string | undefined {
  const business = raw.business_detail?.business_name
  if (business) return business
  const given = raw.given_names ?? raw.individual_detail?.given_names
  const sur = raw.surname ?? raw.individual_detail?.surname
  const joined = [given, sur].filter(Boolean).join(' ').trim()
  return joined || undefined
}

export function transformCustomer(raw: RawXenditCustomer): Customer {
  return {
    id: String(raw.id ?? raw.reference_id ?? ''),
    externalId: String(raw.id ?? raw.reference_id ?? ''),
    email: raw.email ?? undefined,
    name: deriveName(raw),
    phone: raw.mobile_number ?? raw.phone_number ?? undefined,
    description: raw.description ?? undefined,
    gateway: 'xendit',
    metadata: strMap({ ...(raw.metadata ?? {}), reference_id: raw.reference_id, type: raw.type }),
    createdAt: toIsoDatetime(raw.created),
    updatedAt: toIsoDatetime(raw.updated),
    raw,
  }
}
