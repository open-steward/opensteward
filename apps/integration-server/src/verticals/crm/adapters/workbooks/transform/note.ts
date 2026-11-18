import type { Note } from '../../../schema/note'

export interface RawWorkbooksNote {
  id: string | number
  subject?: string
  text?: string
  resource_id?: string | number
  resource_type?: string
  assigned_to_id?: string | number
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformNote(raw: RawWorkbooksNote): Note {
  return {
    id: String(raw.id),
    content: raw.text ?? raw.subject ?? '',
    contact_id: raw.resource_id !== undefined ? String(raw.resource_id) : undefined,
    owner_id: raw.assigned_to_id !== undefined ? String(raw.assigned_to_id) : undefined,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out['text'] = data.content
  if (data.contact_id !== undefined) {
    out['resource_id'] = data.contact_id
    out['resource_type'] = 'Private::Crm::Person'
  }
  return out
}
