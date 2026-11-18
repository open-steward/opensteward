import type { Contact } from '../../../schema/contact'

export interface AgileCrmProperty {
  name: string
  value: string
  type?: string
  /** Documented on SYSTEM properties such as email, phone, address, website. */
  subtype?: string
}

export interface RawAgileCrmContact {
  id: number
  properties: AgileCrmProperty[]
  company_id?: number | null
  owner?: { id: number; name?: string } | null
  tags?: string[]
  created_time?: number
  updated_time?: number
  [key: string]: unknown
}

/** Extract the first property value matching the given name. */
function prop(properties: AgileCrmProperty[], name: string): string | undefined {
  return properties.find((p) => p.name === name)?.value
}

export function transformContact(raw: RawAgileCrmContact): Contact {
  return {
    id: String(raw.id),
    first_name: prop(raw.properties, 'first_name'),
    last_name: prop(raw.properties, 'last_name'),
    email: prop(raw.properties, 'email'),
    phone: prop(raw.properties, 'phone'),
    title: prop(raw.properties, 'title'),
    company_id: raw.company_id != null ? String(raw.company_id) : undefined,
    owner_id: raw.owner?.id != null ? String(raw.owner.id) : undefined,
    tags: raw.tags,
    created_at: raw.created_time ? new Date(raw.created_time * 1000).toISOString() : undefined,
    updated_at: raw.updated_time ? new Date(raw.updated_time * 1000).toISOString() : undefined,
    metadata: raw,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const properties: AgileCrmProperty[] = []
  if (data.first_name != null)
    properties.push({ name: 'first_name', value: data.first_name, type: 'SYSTEM' })
  if (data.last_name != null)
    properties.push({ name: 'last_name', value: data.last_name, type: 'SYSTEM' })
  if (data.email != null) properties.push({ name: 'email', value: data.email, type: 'SYSTEM' })
  if (data.phone != null) properties.push({ name: 'phone', value: data.phone, type: 'SYSTEM' })
  if (data.title != null) properties.push({ name: 'title', value: data.title, type: 'SYSTEM' })

  const out: Record<string, unknown> = { properties }
  if (data.company_id !== undefined) out.company_id = Number(data.company_id)
  if (data.tags !== undefined) out.tags = data.tags
  return out
}
