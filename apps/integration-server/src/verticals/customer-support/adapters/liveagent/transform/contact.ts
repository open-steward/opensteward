/**
 * LiveAgent ContactListItem → canonical Contact.
 *
 * ContactListItem fields: id, firstname, lastname, system_name,
 * registration_email, emails (list), phones (list),
 * company_id, date_created, date_changed, language, city,
 * countrycode, type, gender.
 */
import type { Contact } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawLiveagentContact {
  id?: string
  firstname?: string
  lastname?: string
  system_name?: string
  registration_email?: string
  emails?: string[]
  phones?: string[]
  company_id?: string | null
  date_created?: string
  date_changed?: string
  language?: string
  city?: string
  countrycode?: string
  type?: string
  gender?: string
  [key: string]: unknown
}

function pickEmail(raw: RawLiveagentContact): string | undefined {
  if (raw.registration_email) return pickStr(raw.registration_email)
  if (raw.emails && raw.emails.length > 0) return pickStr(raw.emails[0])
  return undefined
}

function pickPhone(raw: RawLiveagentContact): string | undefined {
  if (raw.phones && raw.phones.length > 0) return pickStr(raw.phones[0])
  return undefined
}

function pickName(raw: RawLiveagentContact): string {
  const first = pickStr(raw.firstname) ?? ''
  const last = pickStr(raw.lastname) ?? ''
  const full = [first, last].filter(Boolean).join(' ')
  if (full) return full
  return pickStr(raw.system_name) ?? ''
}

export function transformContact(raw: RawLiveagentContact): Contact {
  const id = pickStr(raw.id) ?? ''
  return {
    id,
    externalId: id,
    email: pickEmail(raw),
    name: pickName(raw),
    phone: pickPhone(raw),
    organizationId: raw.company_id ? pickStr(raw.company_id) : undefined,
    platform: 'liveagent',
    metadata: strMap({
      language: raw.language,
      city: raw.city,
      countrycode: raw.countrycode,
      type: raw.type,
      gender: raw.gender,
      createdAt: toIso(raw.date_created),
    }),
    raw,
  }
}
