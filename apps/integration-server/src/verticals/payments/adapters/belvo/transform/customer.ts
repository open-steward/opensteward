/**
 * Belvo owner → canonical Customer.
 *
 * An "owner" is the account holder (person or company) behind a Belvo Link —
 * the closest canonical analogue to a payments Customer. Belvo splits the
 * name across `display_name` / `first_name` / `last_name` and exposes one
 * primary email + phone. Government identifiers and address detail are kept
 * in `metadata` rather than promoted to typed fields.
 *
 * Docs: https://developers.belvo.com/apis/belvoopenapispec/owners
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Customer } from '../../../schema/customer'
import { pickStr, strMap } from './shared'

export interface RawBelvoOwner {
  id?: string
  link?: string | null
  internal_identification?: string | null
  display_name?: string | null
  first_name?: string | null
  last_name?: string | null
  second_last_name?: string | null
  email?: string | null
  phone_number?: string | null
  address?: string | null
  document_id?: {
    document_type?: string | null
    document_number?: string | null
  } | null
  collected_at?: string | null
  created_at?: string | null
  [key: string]: unknown
}

function fullName(raw: RawBelvoOwner): string | undefined {
  if (raw.display_name) return raw.display_name
  const joined = [raw.first_name, raw.last_name, raw.second_last_name]
    .filter(Boolean)
    .join(' ')
    .trim()
  return joined || undefined
}

export function transformCustomer(raw: RawBelvoOwner): Customer {
  return {
    id: pickStr(raw.id) ?? '',
    externalId: pickStr(raw.id) ?? '',
    email: raw.email ?? undefined,
    name: fullName(raw),
    phone: raw.phone_number ?? undefined,
    gateway: 'belvo',
    metadata: strMap({
      link: raw.link,
      internal_identification: raw.internal_identification,
      address: raw.address,
      document_type: raw.document_id?.document_type,
      document_number: raw.document_id?.document_number,
    }),
    createdAt: toIsoDatetime(raw.collected_at ?? raw.created_at),
    updatedAt: toIsoDatetime(raw.created_at ?? raw.collected_at),
    raw,
  }
}
