import { toIsoDatetime } from '@opensteward/shared'
import type { Note } from '../../../schema/note'

/**
 * Raw Manatal note object.
 * Notes in Manatal are sub-resources of candidates, contacts, organizations, and jobs.
 * We attach the parent resource IDs as optional fields on the raw type.
 */
export interface RawManatalNote {
  id: number
  content?: string
  created_by?: number | null
  created_at?: string
  updated_at?: string
  // Injected by the adapter when fetching notes under a parent resource
  _candidate_id?: string
  _contact_id?: string
  _organization_id?: string
  _job_id?: string
  [key: string]: unknown
}

export function transformNote(raw: RawManatalNote): Note {
  return {
    id: String(raw.id),
    content: raw.content ?? '',
    contact_id: raw._candidate_id ?? raw._contact_id ?? undefined,
    company_id: raw._organization_id ?? undefined,
    deal_id: raw._job_id ?? undefined,
    owner_id: raw.created_by != null ? String(raw.created_by) : undefined,
    created_at: toIsoDatetime(raw.created_at),
    updated_at: toIsoDatetime(raw.updated_at),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out.content = data.content
  return out
}
