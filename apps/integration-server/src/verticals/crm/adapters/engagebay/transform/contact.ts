/**
 * Transform between EngageBay contact wire format and canonical Contact.
 *
 * EngageBay stores most fields inside a `properties` array of
 * `{ name, value, subtype? }` objects. A few top-level fields
 * (id, score, owner_id, tags, cursor) live outside that array.
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Contact } from '../../../schema/contact'

export interface EngageBayProperty {
  name: string
  value?: string | null
  subtype?: string
  field_type?: string
  type?: string
}

export interface RawEngageBayContact {
  id?: number | string
  score?: number
  owner_id?: number | string
  tags?: Array<{ tag: string }>
  cursor?: string
  created_time?: number | string
  updated_time?: number | string
  properties?: EngageBayProperty[]
  [key: string]: unknown
}

/** Pull the first matching property value out of the properties array. */
function prop(
  properties: EngageBayProperty[] | undefined,
  name: string,
  subtype?: string,
): string | undefined {
  if (!properties) return undefined
  const match = properties.find(
    (p) => p.name === name && (subtype === undefined || p.subtype === subtype),
  )
  return match?.value ?? undefined
}

export function transformContact(raw: RawEngageBayContact): Contact {
  const props = raw.properties as EngageBayProperty[] | undefined
  const firstName = prop(props, 'name') ?? undefined
  const lastName = prop(props, 'last_name') ?? undefined
  const nameParts = [firstName, lastName].filter(Boolean)

  return {
    id: String(raw.id ?? ''),
    first_name: firstName,
    last_name: lastName,
    name: nameParts.length > 0 ? nameParts.join(' ') : undefined,
    email: prop(props, 'email'),
    phone: prop(props, 'phone') ?? prop(props, 'phone', 'work'),
    mobile: prop(props, 'phone', 'mobile'),
    title: prop(props, 'role'),
    owner_id: raw.owner_id != null ? String(raw.owner_id) : undefined,
    tags: (raw.tags ?? []).map((t) => t.tag),
    created_at: toIsoDatetime(raw.created_time),
    updated_at: toIsoDatetime(raw.updated_time),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const properties: EngageBayProperty[] = []
  if (data.first_name !== undefined) {
    properties.push({ name: 'name', value: data.first_name, field_type: 'TEXT', type: 'SYSTEM' })
  }
  if (data.last_name !== undefined) {
    properties.push({ name: 'last_name', value: data.last_name, field_type: 'TEXT', type: 'SYSTEM' })
  }
  if (data.email !== undefined) {
    properties.push({ name: 'email', value: data.email, field_type: 'TEXT', type: 'SYSTEM', subtype: 'primary' })
  }
  if (data.phone !== undefined) {
    properties.push({ name: 'phone', value: data.phone, field_type: 'TEXT', type: 'SYSTEM', subtype: 'work' })
  }
  if (data.mobile !== undefined) {
    properties.push({ name: 'phone', value: data.mobile, field_type: 'TEXT', type: 'SYSTEM', subtype: 'mobile' })
  }
  if (data.title !== undefined) {
    properties.push({ name: 'role', value: data.title, field_type: 'TEXT', type: 'SYSTEM' })
  }

  const out: Record<string, unknown> = { properties }
  if (data.owner_id !== undefined) out.owner_id = Number(data.owner_id)
  if (data.tags !== undefined) out.tags = data.tags.map((t) => ({ tag: t }))
  return out
}
