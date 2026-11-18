import type { Note } from '../../../schema/note'

interface KommoNoteParams {
  text?: string
  [key: string]: unknown
}

export interface RawKommoNote {
  id: number
  note_type?: string
  params?: KommoNoteParams
  entity_id?: number
  entity_type?: string
  responsible_user_id?: number
  created_at?: number
  updated_at?: number
  [key: string]: unknown
}

function unixToIso(ts: number | undefined): string | undefined {
  if (ts == null || ts === 0) return undefined
  return new Date(ts * 1000).toISOString()
}

export function transformNote(raw: RawKommoNote): Note {
  const isContact = raw.entity_type === 'contacts'
  const isLead = raw.entity_type === 'leads'

  return {
    id: String(raw.id),
    content: raw.params?.text ?? '',
    contact_id: isContact && raw.entity_id != null ? String(raw.entity_id) : undefined,
    deal_id: isLead && raw.entity_id != null ? String(raw.entity_id) : undefined,
    owner_id: raw.responsible_user_id != null ? String(raw.responsible_user_id) : undefined,
    created_at: unixToIso(raw.created_at),
    updated_at: unixToIso(raw.updated_at),
    metadata: raw,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  return {
    note_type: 'common',
    params: { text: data.content ?? '' },
  }
}
