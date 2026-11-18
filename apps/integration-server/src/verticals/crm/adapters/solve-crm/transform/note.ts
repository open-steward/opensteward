import type { Note } from '../../../schema/note'

export interface RawSolveNote {
  id?: string | number
  description?: string
  text?: string
  contactId?: string | null
  organisationId?: string | null
  projectId?: string | null
  assignee?: string | null
  created?: string | null
  updated?: string | null
  [key: string]: unknown
}

export function transformNote(raw: RawSolveNote): Note {
  return {
    id: String(raw.id ?? ''),
    content: raw.description ?? raw.text ?? '',
    contact_id: raw.contactId != null ? String(raw.contactId) : undefined,
    company_id: raw.organisationId != null ? String(raw.organisationId) : undefined,
    deal_id: raw.projectId != null ? String(raw.projectId) : undefined,
    owner_id: raw.assignee != null ? String(raw.assignee) : undefined,
    created_at: raw.created ?? undefined,
    updated_at: raw.updated ?? undefined,
    metadata: raw,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out.description = data.content
  if (data.contact_id !== undefined) out.contactId = data.contact_id
  if (data.company_id !== undefined) out.organisationId = data.company_id
  if (data.deal_id !== undefined) out.projectId = data.deal_id
  if (data.owner_id !== undefined) out.assignee = data.owner_id
  return out
}
