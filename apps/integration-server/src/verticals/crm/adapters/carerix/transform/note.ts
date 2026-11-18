/**
 * Transform Carerix CRNote (or "comment") records to/from the canonical Note type.
 *
 * Carerix stores free-form notes attached to candidates (CREmployee) or companies.
 * The object type exposed via the REST API is typically accessed through the employee
 * record's notes sub-resource or as a standalone CRNote object.
 *
 * Carerix CRNote field names (JSON API):
 *   noteID, id, noteText, toEmployee (linked candidate ref), toCompany,
 *   toUser (author/owner), dateCreated, dateModified
 */

import type { Note } from '../../../schema/note'
import { toIsoDatetime } from '@opensteward/shared'

export interface RawCarerixNote {
  /** Platform-assigned record ID. */
  noteID?: string | number
  /** May also appear as `id`. */
  id?: string | number
  /** Note body text. */
  noteText?: string
  /** Linked candidate (CREmployee) ref. */
  toEmployee?: {
    id?: string | number
    [key: string]: unknown
  } | string | null
  /** Linked company ref. */
  toCompany?: {
    id?: string | number
    [key: string]: unknown
  } | string | null
  /** Author / responsible user. */
  toUser?: {
    id?: string | number
    [key: string]: unknown
  } | string | null
  /** ISO-8601 or Carerix date-string of record creation. */
  dateCreated?: string
  /** ISO-8601 or Carerix date-string of last modification. */
  dateModified?: string
  [key: string]: unknown
}

function extractId(
  ref: { id?: string | number; [key: string]: unknown } | string | null | undefined,
): string | undefined {
  if (!ref) return undefined
  if (typeof ref === 'string') return ref || undefined
  return ref.id != null ? String(ref.id) : undefined
}

export function transformNote(raw: RawCarerixNote): Note {
  const id = raw.noteID ?? raw.id
  return {
    id: String(id ?? ''),
    content: raw.noteText ?? '',
    contact_id: extractId(raw.toEmployee as { id?: string | number } | null),
    company_id: extractId(raw.toCompany as { id?: string | number } | null),
    owner_id: extractId(raw.toUser as { id?: string | number } | null),
    created_at: toIsoDatetime(raw.dateCreated),
    updated_at: toIsoDatetime(raw.dateModified),
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out.noteText = data.content
  if (data.contact_id !== undefined) out.toEmployee = data.contact_id
  if (data.company_id !== undefined) out.toCompany = data.company_id
  if (data.owner_id !== undefined) out.toUser = data.owner_id
  return out
}
