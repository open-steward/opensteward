import type { Note } from '../../../schema/note'

export interface RawSalesloftNote {
  id: number
  content?: string
  associated_type?: string
  associated_to?: { id?: number } | null
  user_id?: number | null
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformNote(raw: RawSalesloftNote): Note {
  const associatedId = raw.associated_to?.id != null
    ? String(raw.associated_to.id)
    : undefined

  const contactId = raw.associated_type === 'Person' ? associatedId : undefined
  const dealId = raw.associated_type === 'Opportunity' ? associatedId : undefined

  return {
    id: String(raw.id),
    content: raw.content ?? '',
    contact_id: contactId,
    deal_id: dealId,
    owner_id: raw.user_id != null ? String(raw.user_id) : undefined,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    metadata: raw,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out['content'] = data.content
  if (data.contact_id !== undefined) {
    out['associated_type'] = 'Person'
    out['associated_to'] = { id: Number(data.contact_id) }
  } else if (data.deal_id !== undefined) {
    out['associated_type'] = 'Opportunity'
    out['associated_to'] = { id: Number(data.deal_id) }
  }
  if (data.owner_id !== undefined) out['user_id'] = Number(data.owner_id)
  return out
}
