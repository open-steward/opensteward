import type { Note } from '../../../schema/note'

// Mautic Note entity
export interface RawMauticNote {
  id?: string | number
  text?: string
  type?: string
  lead?: { id?: string | number } | null
  dateTime?: string
  [key: string]: unknown
}

export function transformNote(raw: RawMauticNote): Note {
  return {
    id: String(raw.id ?? ''),
    content: (raw.text as string | undefined) ?? '',
    contact_id: raw.lead?.id != null ? String(raw.lead.id) : undefined,
    created_at: raw.dateTime,
    metadata: raw,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out.text = data.content
  if (data.contact_id !== undefined) out.lead = { id: data.contact_id }
  return out
}
