import type { Note } from '../../../schema/note'

/**
 * Vitally REST API note object shape.
 *
 * Docs: https://docs.vitally.io/en/articles/9880672-rest-api-notes
 */
export interface RawVitallyNote {
  id: string
  externalId?: string | null
  note?: string | null
  subject?: string | null
  authorId?: string | null
  accountId?: string | null
  categoryId?: string | null
  tags?: string[]
  noteDate?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  archivedAt?: string | null
  [key: string]: unknown
}

export function transformNote(raw: RawVitallyNote): Note {
  return {
    id: String(raw.id),
    content: typeof raw.note === 'string' ? raw.note : (typeof raw.subject === 'string' ? raw.subject : ''),
    company_id: typeof raw.accountId === 'string' ? raw.accountId : undefined,
    owner_id: typeof raw.authorId === 'string' ? raw.authorId : undefined,
    created_at: typeof raw.createdAt === 'string' ? raw.createdAt : undefined,
    updated_at: typeof raw.updatedAt === 'string' ? raw.updatedAt : undefined,
    metadata: raw,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out.note = data.content
  if (data.company_id !== undefined) out.accountId = data.company_id
  return out
}
