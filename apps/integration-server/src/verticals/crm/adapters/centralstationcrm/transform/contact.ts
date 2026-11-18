/**
 * Transform CentralStationCRM "person" objects to/from canonical Contact.
 *
 * Wire shape (GET /people.json or /people/{id}.json with ?includes=contact_details companies tags):
 * {
 *   person: {
 *     id, first_name, last_name, title, background, user_id,
 *     created_at, updated_at,
 *     contact_details: [{ id, atype, name, value }],
 *     companies: [{ company: { id, name } }],
 *     tags: [{ tag: { id, name } }]
 *   }
 * }
 *
 * contact_details atype values: "email", "phone", "mobile", "fax", "url", "twitter", ...
 */

import { toIsoDatetime } from '@opensteward/shared'
import type { Contact } from '../../../schema/contact'

export interface RawCentralStationContactDetail {
  id?: number | string
  atype?: string
  name?: string
  value?: string
  [key: string]: unknown
}

export interface RawCentralStationCompanyRef {
  company?: {
    id?: number | string
    name?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

export interface RawCentralStationTag {
  tag?: {
    id?: number | string
    name?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

export interface RawCentralStationPerson {
  id: number | string
  first_name?: string
  last_name?: string
  title?: string
  background?: string
  user_id?: number | string
  created_at?: string
  updated_at?: string
  contact_details?: RawCentralStationContactDetail[]
  companies?: RawCentralStationCompanyRef[]
  tags?: RawCentralStationTag[]
  [key: string]: unknown
}

/** Wrapper shape returned by the API for a single person. */
export interface RawCentralStationPersonWrapper {
  person: RawCentralStationPerson
  [key: string]: unknown
}

function firstContactDetail(
  details: RawCentralStationContactDetail[] | undefined,
  atype: string,
): string | undefined {
  if (!details) return undefined
  return details.find((d) => d.atype === atype)?.value ?? undefined
}

export function transformContact(raw: RawCentralStationPerson): Contact {
  const details = raw.contact_details ?? []
  const nameParts = [raw.first_name, raw.last_name].filter(Boolean)
  const primaryCompany = raw.companies?.[0]?.company
  const tags = (raw.tags ?? [])
    .map((t) => t.tag?.name)
    .filter((n): n is string => typeof n === 'string')

  return {
    id: String(raw.id),
    first_name: raw.first_name ?? undefined,
    last_name: raw.last_name ?? undefined,
    name: nameParts.length > 0 ? nameParts.join(' ') : undefined,
    email: firstContactDetail(details, 'email'),
    phone: firstContactDetail(details, 'phone'),
    mobile: firstContactDetail(details, 'mobile'),
    title: raw.title ?? undefined,
    company_id: primaryCompany?.id != null ? String(primaryCompany.id) : undefined,
    owner_id: raw.user_id != null ? String(raw.user_id) : undefined,
    tags: tags.length > 0 ? tags : undefined,
    created_at: toIsoDatetime(raw.created_at),
    updated_at: toIsoDatetime(raw.updated_at),
    metadata: raw,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const person: Record<string, unknown> = {}
  if (data.first_name !== undefined) person.first_name = data.first_name
  if (data.last_name !== undefined) person.last_name = data.last_name
  if (data.title !== undefined) person.title = data.title
  if (data.owner_id !== undefined) person.user_id = data.owner_id

  // contact_details are sent as nested attributes
  const contactDetails: Array<Record<string, unknown>> = []
  if (data.email !== undefined) {
    contactDetails.push({ contact_detail: { atype: 'email', value: data.email } })
  }
  if (data.phone !== undefined) {
    contactDetails.push({ contact_detail: { atype: 'phone', value: data.phone } })
  }
  if (data.mobile !== undefined) {
    contactDetails.push({ contact_detail: { atype: 'mobile', value: data.mobile } })
  }
  if (contactDetails.length > 0) {
    person.contact_details_attributes = contactDetails
  }

  return { person }
}
