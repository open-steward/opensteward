/**
 * Transform CentralStationCRM "company" objects to/from canonical Company.
 *
 * Wire shape (GET /companies.json with ?includes=contact_details tags):
 * {
 *   company: {
 *     id, name, background, user_id, created_at, updated_at,
 *     contact_details: [{ id, atype, name, value }],
 *     tags: [{ tag: { id, name } }]
 *   }
 * }
 */

import { toIsoDatetime } from '@opensteward/shared'
import type { Company } from '../../../schema/company'
import type {
  RawCentralStationContactDetail,
  RawCentralStationTag,
} from './contact'

export interface RawCentralStationCompany {
  id: number | string
  name?: string
  background?: string
  user_id?: number | string
  created_at?: string
  updated_at?: string
  contact_details?: RawCentralStationContactDetail[]
  tags?: RawCentralStationTag[]
  [key: string]: unknown
}

export interface RawCentralStationCompanyWrapper {
  company: RawCentralStationCompany
  [key: string]: unknown
}

function firstContactDetail(
  details: RawCentralStationContactDetail[] | undefined,
  atype: string,
): string | undefined {
  if (!details) return undefined
  return details.find((d) => d.atype === atype)?.value ?? undefined
}

export function transformCompany(raw: RawCentralStationCompany): Company {
  const details = raw.contact_details ?? []
  const tags = (raw.tags ?? [])
    .map((t) => t.tag?.name)
    .filter((n): n is string => typeof n === 'string')

  return {
    id: String(raw.id),
    name: raw.name ?? '',
    phone: firstContactDetail(details, 'phone'),
    owner_id: raw.user_id != null ? String(raw.user_id) : undefined,
    tags: tags.length > 0 ? tags : undefined,
    created_at: toIsoDatetime(raw.created_at),
    updated_at: toIsoDatetime(raw.updated_at),
    metadata: raw,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const company: Record<string, unknown> = {}
  if (data.name !== undefined) company.name = data.name
  if (data.owner_id !== undefined) company.user_id = data.owner_id

  const contactDetails: Array<Record<string, unknown>> = []
  if (data.phone !== undefined) {
    contactDetails.push({ contact_detail: { atype: 'phone', value: data.phone } })
  }
  if (contactDetails.length > 0) {
    company.contact_details_attributes = contactDetails
  }

  return { company }
}
