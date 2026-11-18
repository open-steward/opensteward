/**
 * Spiro companies (JSON:API `company` resources) → canonical Company.
 *
 * GET /api/v1/companies and GET /api/v1/companies/{id}, documented example item:
 *   { "id": "432", "type": "company",
 *     "attributes": { "id": 432, "name": "West-Schuster", "website": "parisian.test",
 *       "address": "59433 Lucina Greens", "city": "North Glindabury", "zipcode": "36791-9251",
 *       "parent_id": null, "country": "Slovenia", "state": "Kansas",
 *       "phone": "1-237-139-3783 x372", "description": "Compatible encompassing neural-net",
 *       "custom": {}, "created_at": "2026-09-01T09:57:38.304Z",
 *       "updated_at": "2026-09-01T09:57:38.304Z", "external_id": null },
 *     "relationships": { "user": { "data": { "id": "990", "type": "user" } } } }
 *
 * `country` is a country NAME ("Slovenia", "Tuvalu"), and canonical
 * address.country is an ISO 3166-1 alpha-2 code, so it stays in metadata.
 * `website` is a bare host in every example ("parisian.test") and maps to
 * `domain` as sent. No industry or headcount attribute is documented.
 *
 * Source: https://developers.spiro.ai/api/docs/v1/openapi.json
 */
import type { Company } from '../../../schema/company'
import { relatedId, type SpiroResource } from '../client'

export interface SpiroCompanyAttributes {
  id: number
  name: string
  website: string | null
  address: string | null
  city: string | null
  zipcode: string | null
  parent_id: number | null
  country: string | null
  state: string | null
  phone: string | null
  description: string | null
  custom: Record<string, unknown>
  created_at: string
  updated_at: string
  external_id: string | null
}

export type RawSpiroCompany = SpiroResource<SpiroCompanyAttributes>

export function transformCompany(raw: RawSpiroCompany): Company {
  const a = raw.attributes
  const hasAddress = a.address != null || a.city != null || a.state != null || a.zipcode != null
  return {
    id: raw.id,
    name: a.name,
    domain: a.website ?? undefined,
    phone: a.phone ?? undefined,
    owner_id: relatedId(raw, 'user'),
    address: hasAddress
      ? { line1: a.address, city: a.city, region: a.state, postalCode: a.zipcode }
      : undefined,
    created_at: a.created_at,
    updated_at: a.updated_at,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.name = data.name
  if (data.domain !== undefined) out.website = data.domain
  if (data.phone !== undefined) out.phone = data.phone
  if (data.industry !== undefined) out.industry = data.industry
  if (data.size !== undefined) out.employee_count = data.size
  if (data.owner_id !== undefined) out.owner_id = data.owner_id
  return out
}
