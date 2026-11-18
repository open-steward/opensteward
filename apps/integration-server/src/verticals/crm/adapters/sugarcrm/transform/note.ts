import type { Note } from '../../../schema/note'

export interface RawSugarNote {
  id: string
  name?: string
  description?: string
  contact_id?: string
  opportunity_id?: string
  assigned_user_id?: string
  date_entered?: string
  date_modified?: string
  [key: string]: unknown
}

function toIso(value?: string): string | undefined {
  if (!value) return undefined
  if (/Z$|[+-]\d{2}:\d{2}$/.test(value)) return value
  return `${value}Z`
}

export function transformNote(raw: RawSugarNote): Note {
  // Notes schema uses `content` as the primary body field
  const content = raw.description || raw.name || ''
  return {
    id: raw.id,
    content,
    contact_id: raw.contact_id || undefined,
    deal_id: raw.opportunity_id || undefined,
    owner_id: raw.assigned_user_id || undefined,
    created_at: toIso(raw.date_entered),
    updated_at: toIso(raw.date_modified),
    metadata: raw,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) {
    out.name = data.content.substring(0, 255)
    out.description = data.content
  }
  if (data.contact_id !== undefined) out.contact_id = data.contact_id
  if (data.deal_id !== undefined) out.opportunity_id = data.deal_id
  if (data.owner_id !== undefined) out.assigned_user_id = data.owner_id
  return out
}
