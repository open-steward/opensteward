/**
 * BoondManager company ↔ canonical Company transform.
 *
 * BoondManager companies are returned as JSON:API items.
 *
 * Key attributes:
 *   name, email1, phone1, website, city, country, siret
 *   creationDate, updateDate — ISO 8601 strings
 */

import type { Company } from '../../../schema/company'
import { toIsoDatetime } from '@opensteward/shared'
import type { JsonApiItem } from '../client'

export interface RawBoondManagerCompany extends JsonApiItem {
  attributes: {
    name?: string
    email1?: string
    phone1?: string
    website?: string
    city?: string
    country?: string
    siret?: string
    state?: number
    note?: string
    creationDate?: string
    updateDate?: string
    [key: string]: unknown
  }
  relationships?: {
    mainManager?: { data?: { id?: string; type?: string } | null }
    [key: string]: unknown
  }
}

export function transformCompany(raw: RawBoondManagerCompany): Company {
  const a = raw.attributes ?? {}
  const rels = raw.relationships ?? {}

  const ownerId =
    (rels.mainManager as { data?: { id?: string } | null } | undefined)?.data?.id

  return {
    id: String(raw.id),
    name: (a.name as string | undefined) ?? '',
    phone: (a.phone1 as string | undefined) ?? undefined,
    domain: (a.website as string | undefined) ?? undefined,
    owner_id: ownerId ?? undefined,
    created_at: toIsoDatetime(a.creationDate),
    updated_at: toIsoDatetime(a.updateDate),
    metadata: { id: raw.id, type: raw.type, ...a, relationships: rels },
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out['name'] = data.name
  if (data.phone !== undefined) out['phone1'] = data.phone
  if (data.domain !== undefined) out['website'] = data.domain
  return out
}
