import type { Activity } from '../../../schema/activity'
import type { JsonApiResource } from '../client'

export interface RawOutreachActivityAttributes {
  type?: string
  body?: string
  dueAt?: string
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export type RawOutreachActivity = JsonApiResource<RawOutreachActivityAttributes>

export function transformActivity(raw: RawOutreachActivity): Activity {
  const attrs = raw.attributes

  const prospectRel = raw.relationships?.['prospect']?.data
  const contactId = prospectRel && !Array.isArray(prospectRel)
    ? String(prospectRel.id)
    : undefined

  const opportunityRel = raw.relationships?.['opportunity']?.data
  const dealId = opportunityRel && !Array.isArray(opportunityRel)
    ? String(opportunityRel.id)
    : undefined

  return {
    id: String(raw.id),
    type: attrs.type,
    note: attrs.body,
    contact_id: contactId,
    deal_id: dealId,
    due_date: attrs.dueAt,
    created_at: attrs.createdAt,
    updated_at: attrs.updatedAt,
    metadata: raw,
  }
}
