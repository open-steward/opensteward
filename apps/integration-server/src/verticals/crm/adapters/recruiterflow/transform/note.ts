import type { Note } from '../../../schema/note'

/**
 * Recruiterflow candidate note object.
 *
 * Key fields (from /api/external/candidate/task/list and notes/add):
 *   id           – note ID
 *   content      – note body text
 *   candidate_id – linked candidate ID
 *   client_id    – linked client ID
 *   owner_id     – author user ID
 *   created_at   – ISO-8601 creation timestamp
 *   updated_at   – ISO-8601 last-modified timestamp
 */
export interface RawRecruiterflowNote {
  id: string | number
  content?: string
  candidate_id?: string | number
  client_id?: string | number
  owner_id?: string | number
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

function toIso(v: unknown): string | undefined {
  if (typeof v !== 'string' || !v) return undefined
  const d = new Date(v)
  return isNaN(d.getTime()) ? undefined : d.toISOString()
}

export function transformNote(raw: RawRecruiterflowNote): Note {
  return {
    id: String(raw.id),
    content: raw.content ?? '',
    contact_id: raw.candidate_id !== undefined ? String(raw.candidate_id) : undefined,
    company_id: raw.client_id !== undefined ? String(raw.client_id) : undefined,
    owner_id: raw.owner_id !== undefined ? String(raw.owner_id) : undefined,
    created_at: toIso(raw.created_at),
    updated_at: toIso(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out.content = data.content
  if (data.contact_id !== undefined) out.candidate_id = data.contact_id
  if (data.company_id !== undefined) out.client_id = data.company_id
  return out
}
