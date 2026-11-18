/**
 * Plain customer → canonical Contact transform.
 *
 * Docs: https://www.plain.com/docs/graphql/customers
 */
import type { Contact } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawPlainCustomer {
  id: string
  externalId?: string | null
  fullName?: string | null
  shortName?: string | null
  email?: { email?: string | null; isVerified?: boolean } | null
  phone?: { phoneNumber?: string | null } | null
  company?: { id?: string | null } | null
  createdAt?: { iso8601?: string | null } | null
  updatedAt?: { iso8601?: string | null } | null
  [key: string]: unknown
}

export function transformContact(raw: RawPlainCustomer): Contact {
  return {
    id: raw.id,
    externalId: pickStr(raw.externalId) ?? raw.id,
    email: pickStr(raw.email?.email),
    name: pickStr(raw.fullName) ?? pickStr(raw.shortName) ?? '',
    phone: pickStr(raw.phone?.phoneNumber),
    organizationId: raw.company?.id ? pickStr(raw.company.id) : undefined,
    platform: 'plain',
    metadata: strMap({
      emailVerified: raw.email?.isVerified,
      createdAt: raw.createdAt?.iso8601,
      updatedAt: toIso(raw.updatedAt?.iso8601),
    }),
    raw,
  }
}
