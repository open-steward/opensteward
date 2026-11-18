/**
 * Chaskiq app_user → canonical Contact.
 *
 * AppUser fields: id, email, name, first_name, last_name, phone, display_name,
 * full_name, properties, tag_list, type (AppUser | Visitor), kind.
 */
import type { Contact } from '../../../schema'
import { pickStr, strMap } from './shared'

/** Raw AppUserType from Chaskiq GraphQL. */
export interface RawChaskiqAppUser {
  id?: string | null
  email?: string | null
  name?: string | null
  first_name?: string | null
  last_name?: string | null
  display_name?: string | null
  full_name?: string | null
  phone?: string | null
  kind?: string | null
  tag_list?: string[] | null
  [key: string]: unknown
}

function resolveName(raw: RawChaskiqAppUser): string {
  const computed = [raw.first_name, raw.last_name].filter(Boolean).join(' ')
  return (
    pickStr(raw.display_name) ??
    pickStr(raw.full_name) ??
    pickStr(raw.name) ??
    pickStr(computed) ??
    ''
  )
}

export function transformContact(raw: RawChaskiqAppUser): Contact {
  const id = pickStr(raw.id) ?? ''
  return {
    id,
    externalId: id,
    email: pickStr(raw.email),
    name: resolveName(raw),
    phone: pickStr(raw.phone),
    platform: 'chaskiq',
    metadata: strMap({
      kind: raw.kind,
      tags: (raw.tag_list ?? []).join(','),
    }),
    raw,
  }
}
