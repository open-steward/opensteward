/**
 * ChurnZero Note ↔ canonical Note transform.
 *
 * ChurnZero does not expose a dedicated "Note" entity through its REST API.
 * This stub remains so the transform directory structure is consistent with
 * other adapters. If ChurnZero adds a Note resource, implement it here.
 *
 * Currently unused — listNotes/getNote/createNote etc. are NOT implemented
 * in ChurnzeroAdapter; the registry returns HTTP 501 automatically.
 */
import type { Note } from '../../../schema/note'

export interface RawChurnZeroNote {
  id: string | number
  content?: string
  accountId?: string | number
  contactId?: string | number
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export function transformNote(raw: RawChurnZeroNote): Note {
  return {
    id: String(raw.id),
    content: raw.content ?? '',
    company_id: raw.accountId != null ? String(raw.accountId) : undefined,
    contact_id: raw.contactId != null ? String(raw.contactId) : undefined,
    created_at: raw.createdAt ?? undefined,
    updated_at: raw.updatedAt ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}
