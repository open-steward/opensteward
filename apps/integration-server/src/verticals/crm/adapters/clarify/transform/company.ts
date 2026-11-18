/**
 * Clarify "company" object type.
 *
 * Attributes: name, domains (array of strings), phone_numbers,
 *   description, employee_count, owner_id, created_at, updated_at
 */

import type { Company } from '../../../schema/company'

export interface RawClarifyCompanyAttributes {
  name?: string
  domains?: string[]
  phone_numbers?: Array<{ value: string; type?: string } | string>
  description?: string
  employee_count?: number | string
  owner_id?: string
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export interface RawClarifyCompany {
  id: string
  type?: string
  attributes: RawClarifyCompanyAttributes
  [key: string]: unknown
}

function pickPhone(
  phones: Array<{ value: string; type?: string } | string> | undefined,
): string | undefined {
  if (!phones || phones.length === 0) return undefined
  const first = phones[0]
  if (typeof first === 'string') return first
  return first.value
}

export function transformCompany(raw: RawClarifyCompany): Company {
  const a = raw.attributes
  const sizeRaw = a.employee_count
  const size =
    sizeRaw != null
      ? typeof sizeRaw === 'number'
        ? sizeRaw
        : parseInt(String(sizeRaw), 10)
      : undefined

  return {
    id: String(raw.id),
    name: a.name ?? '',
    domain: a.domains?.[0] ?? undefined,
    phone: pickPhone(a.phone_numbers),
    size: size != null && !isNaN(size) ? size : undefined,
    owner_id: a.owner_id ?? undefined,
    created_at: a.created_at ?? undefined,
    updated_at: a.updated_at ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const attributes: Record<string, unknown> = {}
  if (data.name !== undefined) attributes.name = data.name
  if (data.domain !== undefined) attributes.domains = [data.domain]
  if (data.phone !== undefined) attributes.phone_numbers = [{ value: data.phone, type: 'work' }]
  if (data.size !== undefined) attributes.employee_count = data.size
  if (data.owner_id !== undefined) attributes.owner_id = data.owner_id
  return {
    data: {
      type: 'company',
      attributes,
    },
  }
}
