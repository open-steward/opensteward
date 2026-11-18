import type { Note } from '../../../schema/note'

export interface RawVtigerNote {
  id: string
  commentcontent?: string
  assigned_user_id?: string
  related_id?: string
  related_to?: string
  createdtime?: string
  modifiedtime?: string
  [key: string]: unknown
}

export function transformNote(raw: RawVtigerNote): Note {
  const isContact = raw.related_to === 'Contacts'
  const isPotential = raw.related_to === 'Potentials'
  return {
    id: String(raw.id),
    content: raw.commentcontent ?? '',
    contact_id: isContact && raw.related_id ? String(raw.related_id) : undefined,
    deal_id: isPotential && raw.related_id ? String(raw.related_id) : undefined,
    owner_id: raw.assigned_user_id ? String(raw.assigned_user_id) : undefined,
    created_at: raw.createdtime,
    updated_at: raw.modifiedtime,
    metadata: raw,
  }
}

export function untransformNote(
  data: Partial<Note>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out.commentcontent = data.content
  if (data.owner_id !== undefined) out.assigned_user_id = data.owner_id
  if (data.contact_id !== undefined) {
    out.related_id = data.contact_id
    out.related_to = 'Contacts'
  } else if (data.deal_id !== undefined) {
    out.related_id = data.deal_id
    out.related_to = 'Potentials'
  }
  return out
}
