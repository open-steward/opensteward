/**
 * Crelate note (PublicApiGetNoteResponse) → canonical Note.
 *
 * Notes in Crelate can be attached to contacts, companies, or jobs.
 * The parent_id field is the ID of the parent entity.
 * The body field holds the note content.
 */

import { toIsoDatetime } from '@opensteward/shared'
import type { Note } from '../../../schema/note'

export interface RawCrelateNote {
  id: string
  body?: string
  parent_id?: string
  parent_name?: string
  pinned?: boolean
  announced?: boolean
  owners?: Array<{ id?: string; name?: string; is_primary?: boolean }>
  created_by_id?: string
  created_by_name?: string
  created_on?: string
  modified_on?: string
  external_primary_key?: string
  [key: string]: unknown
}

function pickOwnerId(raw: RawCrelateNote): string | undefined {
  const owners = raw.owners ?? []
  const primary = owners.find((o) => o.is_primary)
  return primary?.id ?? owners[0]?.id ?? raw.created_by_id
}

export function transformNote(raw: RawCrelateNote): Note {
  return {
    id: String(raw.id),
    content: raw.body ?? '',
    owner_id: pickOwnerId(raw),
    created_at: toIsoDatetime(raw.created_on),
    updated_at: toIsoDatetime(raw.modified_on),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformNote(data: Partial<Note>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.content !== undefined) out.body = data.content
  return out
}
