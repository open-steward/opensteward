import type { Company } from '../../../schema/company'
import type { AgileCrmProperty } from './contact'

/**
 * A company object as the REST API returns it (README 2.3 "Get list of
 * companies" and 2.4 "Get company by ID"). Companies share the contact shape;
 * `type` "distinguishes a contact and a company" ("PERSON" or "COMPANY").
 */
export interface RawAgileCrmCompany {
  id: number
  type?: string
  properties: AgileCrmProperty[]
  owner?: { id: number; name?: string } | null
  tags?: string[]
  /** Epoch seconds. */
  created_time?: number
  /** Epoch seconds; 0 in the documented example for a never-updated company. */
  updated_time?: number
  [key: string]: unknown
}

function prop(properties: AgileCrmProperty[], name: string): string | undefined {
  return properties.find((p) => p.name === name)?.value
}

/** Host of the documented company `url` SYSTEM property, e.g. "http://www.spicejet.com/". */
function hostOf(url: string | undefined): string | undefined {
  if (!url) return undefined
  try {
    return new URL(url).hostname || undefined
  } catch {
    return undefined
  }
}

export function transformCompany(raw: RawAgileCrmCompany): Company {
  const name = prop(raw.properties, 'name')
  if (!name) {
    throw new Error(`AgileCRM company ${raw.id} has no "name" property`)
  }
  return {
    id: String(raw.id),
    name,
    domain: hostOf(prop(raw.properties, 'url')),
    phone: prop(raw.properties, 'phone'),
    owner_id: raw.owner?.id != null ? String(raw.owner.id) : undefined,
    tags: raw.tags,
    created_at: raw.created_time ? new Date(raw.created_time * 1000).toISOString() : undefined,
    updated_at: raw.updated_time ? new Date(raw.updated_time * 1000).toISOString() : undefined,
    metadata: raw,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const properties: AgileCrmProperty[] = []
  if (data.name !== undefined) properties.push({ name: 'name', value: data.name, type: 'SYSTEM' })
  if (data.domain !== undefined)
    properties.push({ name: 'website', value: data.domain, type: 'SYSTEM' })
  if (data.phone !== undefined)
    properties.push({ name: 'phone', value: data.phone, type: 'SYSTEM' })

  const out: Record<string, unknown> = { properties }
  if (data.tags !== undefined) out.tags = data.tags
  return out
}
