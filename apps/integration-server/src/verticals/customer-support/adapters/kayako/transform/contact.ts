/**
 * Kayako user (role=CUSTOMER) → canonical Contact transform.
 *
 * Kayako users have nested `emails` and `phones` arrays of identity objects.
 * The `organization` field is a nested object with an `id` property.
 */
import type { Contact } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface KayakoEmailIdentity {
  address?: string
  is_primary?: boolean
  [key: string]: unknown
}

export interface KayakoPhoneIdentity {
  number?: string
  is_primary?: boolean
  [key: string]: unknown
}

export interface KayakoOrgRef {
  id?: number
  name?: string
  [key: string]: unknown
}

export interface RawKayakoContact {
  id: number
  legacy_id?: string | null
  full_name?: string
  emails?: KayakoEmailIdentity[]
  phones?: KayakoPhoneIdentity[]
  organization?: KayakoOrgRef | null
  role?: { label?: string } | string
  [key: string]: unknown
}

function primaryEmail(raw: RawKayakoContact): string | undefined {
  const emails = raw.emails ?? []
  const primary = emails.find((e) => e.is_primary) ?? emails[0]
  return pickStr(primary?.address)
}

function primaryPhone(raw: RawKayakoContact): string | undefined {
  const phones = raw.phones ?? []
  const primary = phones.find((p) => p.is_primary) ?? phones[0]
  return pickStr(primary?.number)
}

export function transformContact(raw: RawKayakoContact): Contact {
  return {
    id: String(raw.id),
    externalId: String(raw.legacy_id ?? raw.id),
    email: primaryEmail(raw),
    name: pickStr(raw.full_name) ?? '',
    phone: primaryPhone(raw),
    organizationId: raw.organization?.id ? String(raw.organization.id) : undefined,
    platform: 'kayako',
    metadata: strMap({}),
    raw,
  }
}
