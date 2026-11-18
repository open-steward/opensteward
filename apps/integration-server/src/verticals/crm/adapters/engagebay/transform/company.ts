/**
 * Transform between EngageBay company wire format and canonical Company.
 *
 * Like contacts, EngageBay stores most company fields inside a `properties`
 * array. Top-level fields: id, score, owner_id, tags, created_time, updated_time.
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Company } from '../../../schema/company'
import type { EngageBayProperty } from './contact'

export interface RawEngageBayCompany {
  id?: number | string
  owner_id?: number | string
  tags?: Array<{ tag: string }>
  cursor?: string
  created_time?: number | string
  updated_time?: number | string
  properties?: EngageBayProperty[]
  [key: string]: unknown
}

function prop(
  properties: EngageBayProperty[] | undefined,
  name: string,
): string | undefined {
  if (!properties) return undefined
  return properties.find((p) => p.name === name)?.value ?? undefined
}

export function transformCompany(raw: RawEngageBayCompany): Company {
  const props = raw.properties as EngageBayProperty[] | undefined

  return {
    id: String(raw.id ?? ''),
    name: prop(props, 'name') ?? '',
    domain: prop(props, 'url'),
    phone: prop(props, 'phone'),
    owner_id: raw.owner_id != null ? String(raw.owner_id) : undefined,
    tags: (raw.tags ?? []).map((t) => t.tag),
    created_at: toIsoDatetime(raw.created_time),
    updated_at: toIsoDatetime(raw.updated_time),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const properties: EngageBayProperty[] = []
  if (data.name !== undefined) {
    properties.push({ name: 'name', value: data.name, field_type: 'TEXT', type: 'SYSTEM' })
  }
  if (data.domain !== undefined) {
    properties.push({ name: 'url', value: data.domain, field_type: 'TEXT', type: 'SYSTEM' })
  }
  if (data.phone !== undefined) {
    properties.push({ name: 'phone', value: data.phone, field_type: 'TEXT', type: 'SYSTEM' })
  }

  const out: Record<string, unknown> = { properties }
  if (data.owner_id !== undefined) out.owner_id = Number(data.owner_id)
  if (data.tags !== undefined) out.tags = data.tags.map((t) => ({ tag: t }))
  return out
}
