/**
 * Transform Vincere note objects to/from the canonical Note schema.
 *
 * Vincere stores notes against candidates, contacts, and companies.
 * API v2 note fields (wire names):
 *   id, content/text, candidate_id, company_id, job_id,
 *   owner_id, reg_date, updated_date
 */

import { toIsoDatetime } from '@opensteward/shared'
import type { Note } from '../../../schema/note'

export interface RawVincereNote {
  id: number | string
  /** Note body text. */
  content?: string | null
  /** Alternative field name for note body used in some Vincere API versions. */
  text?: string | null
  /** Linked candidate id (maps to Contact). */
  candidate_id?: number | string | null
  /** Linked company id. */
  company_id?: number | string | null
  /** Linked job id (maps to Deal). */
  job_id?: number | string | null
  /** Vincere user who authored the note. */
  owner_id?: number | string | null
  /** Registration / creation timestamp (ISO-8601 string). */
  reg_date?: string
  /** Last-updated timestamp (ISO-8601 string). */
  updated_date?: string
  [key: string]: unknown
}

export function transformNote(raw: RawVincereNote): Note {
  return {
    id: String(raw.id),
    content: raw.content ?? raw.text ?? '',
    contact_id: raw.candidate_id != null ? String(raw.candidate_id) : undefined,
    company_id: raw.company_id != null ? String(raw.company_id) : undefined,
    deal_id: raw.job_id != null ? String(raw.job_id) : undefined,
    owner_id: raw.owner_id != null ? String(raw.owner_id) : undefined,
    created_at: toIsoDatetime(raw.reg_date),
    updated_at: toIsoDatetime(raw.updated_date),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (data.content !== undefined) body.content = data.content
  if (data.owner_id !== undefined) body.owner_id = data.owner_id
  if (data.contact_id !== undefined) body.candidate_id = data.contact_id
  if (data.company_id !== undefined) body.company_id = data.company_id
  if (data.deal_id !== undefined) body.job_id = data.deal_id
  return body
}
