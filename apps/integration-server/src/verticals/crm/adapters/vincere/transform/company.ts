/**
 * Vincere companies → canonical Company.
 *
 * Field names come from Vincere's OpenAPI spec, https://api.vincere.io/vapi.yaml.
 *
 * - GET /company/search/{matrix_vars} returns the `fl` fields requested, and
 *   "Only the fields that have value will be return". Documented fields read
 *   here: `id` "ID of company", `name` "Company name", `website` "Website",
 *   `phone` "Phone", `industry` "List of industry" (items `{ value,
 *   description, value_search }`), `created_date` "Created date of company",
 *   `last_update` "Last update timestamp".
 * - GET /company/{id} ("Get a specific company") returns `id`,
 *   `company_name`, `website`, `phone`, `employees_number`,
 *   `registration_date` and `updated_timestamp` among others.
 */

import { toIsoDatetime } from '@opensteward/shared'
import type { Company } from '../../../schema/company'

/** The `fl` list the search asks for: exactly the fields read below. */
export const COMPANY_SEARCH_FIELDS = [
  'id',
  'name',
  'website',
  'phone',
  'industry',
  'created_date',
  'last_update',
] as const

export interface RawVincereReferenceValue {
  value?: string | null
  description?: string | null
  value_search?: string | null
}

export interface RawVincereCompanySearchItem {
  id: number
  name?: string | null
  website?: string | null
  phone?: string | null
  industry?: RawVincereReferenceValue[] | null
  created_date?: string | null
  last_update?: string | null
  [key: string]: unknown
}

/** GET /company/{id}. */
export interface RawVincereCompany {
  id: number
  company_name?: string | null
  website?: string | null
  phone?: string | null
  employees_number?: number | null
  registration_date?: string | null
  updated_timestamp?: string | null
  [key: string]: unknown
}

function text(v: string | null | undefined): string | undefined {
  return typeof v === 'string' && v.trim() !== '' ? v : undefined
}

function extractDomain(website?: string | null): string | undefined {
  if (!website) return undefined
  try {
    const url = website.startsWith('http') ? website : `https://${website}`
    return new URL(url).hostname.replace(/^www\./, '') || undefined
  } catch {
    return undefined
  }
}

function requireId(raw: { id?: unknown }, what: string): string {
  if (typeof raw.id !== 'number' && typeof raw.id !== 'string') {
    throw new Error(`Vincere ${what} without an id`)
  }
  return String(raw.id)
}

function requireName(name: string | null | undefined, id: string): string {
  const n = text(name)
  if (n === undefined) throw new Error(`Vincere company ${id} has no name`)
  return n
}

export function transformCompanySearchItem(raw: RawVincereCompanySearchItem): Company {
  const id = requireId(raw, 'company search item')
  const industries = (raw.industry ?? [])
    .map((i) => text(i.description))
    .filter((d): d is string => d !== undefined)
  return {
    id,
    name: requireName(raw.name, id),
    domain: extractDomain(raw.website),
    phone: text(raw.phone),
    industry: industries.length > 0 ? industries.join(', ') : undefined,
    created_at: toIsoDatetime(raw.created_date),
    updated_at: toIsoDatetime(raw.last_update),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function transformCompany(raw: RawVincereCompany): Company {
  const id = requireId(raw, 'company')
  const size = raw.employees_number
  return {
    id,
    name: requireName(raw.company_name, id),
    domain: extractDomain(raw.website),
    phone: text(raw.phone),
    size: typeof size === 'number' && Number.isInteger(size) && size >= 0 ? size : undefined,
    created_at: toIsoDatetime(raw.registration_date),
    updated_at: toIsoDatetime(raw.updated_timestamp),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (data.name !== undefined) body.name = data.name
  if (data.domain !== undefined) body.web_site = data.domain
  if (data.phone !== undefined) body.phone = data.phone
  if (data.industry !== undefined) body.industry_name = data.industry
  if (data.size !== undefined) body.number_of_employees = data.size
  return body
}
