/**
 * lemlist Company transform.
 *
 * lemlist /companies response shape:
 *   _id, domain, ownerId, createdBy, createdAt, crmSync,
 *   fields: { name, picture, industry, location, size, foundedOn }
 *
 * Docs: https://developer.lemlist.com/api-reference/endpoints/companies/get-many-companies
 */

import { toIsoDatetime } from '@opensteward/shared'
import type { Company } from '../../../schema/company'

export interface RawLemlistCompanyFields {
  name?: string
  picture?: string
  industry?: string
  location?: string
  size?: string
  foundedOn?: string
  [key: string]: unknown
}

export interface RawLemlistCompany {
  _id: string
  teamId?: string
  domain?: string
  linkedinUrl?: string
  ownerId?: string
  createdBy?: string
  createdAt?: string
  fields?: RawLemlistCompanyFields
  crmSync?: unknown
  [key: string]: unknown
}

export function transformCompany(raw: RawLemlistCompany): Company {
  const fields = raw.fields ?? {}

  // size comes back as a string like "1-10" or "51-200" from lemlist
  const sizeRaw = fields.size
  const sizeParsed = sizeRaw ? parseInt(String(sizeRaw), 10) : undefined
  const size = !isNaN(sizeParsed as number) ? sizeParsed : undefined

  return {
    id: String(raw._id),
    name: (fields.name as string | undefined) ?? raw.domain ?? '',
    domain: raw.domain ?? undefined,
    industry: (fields.industry as string | undefined) ?? undefined,
    size: size,
    owner_id: raw.ownerId ? String(raw.ownerId) : undefined,
    created_at: toIsoDatetime(raw.createdAt),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
